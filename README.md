# AWS Compute & Delivery Showcase 🚀

This repository contains **Infrastructure as Code (Terraform)** to deploy and compare modern AWS compute scaling and GitOps delivery paradigms, heavily leveraging AWS Spot capacity for cost optimization:
1. **Karpenter on Amazon EKS (100% EC2 Spot):** Group-less node autoscaling that observes pending pods and provisions right-sized EC2 Spot instances. The core EKS managed node group (running CoreDNS and the Karpenter controller itself) is also configured to use EC2 Spot instances (`t3.medium`).
2. **Amazon ECS with Fargate Spot:** Serverless compute that provisions individual microVMs (1:1 ratio) for each task without managing underlying EC2 nodes, utilizing Fargate Spot for deep discounts.
3. **Kargo (GitOps Delivery):** Multi-stage application delivery pipeline installed on EKS to promote releases across environments.

## Prerequisites

Before you begin, ensure you have the following installed and configured:
*   [AWS CLI](https://aws.amazon.com/cli/) (authenticated with Administrator access). Ensure you have run `aws configure` or `aws sso login` and have an active profile with permissions to create VPCs, EKS clusters, and IAM roles.
    *   *Tip: You can quickly verify your active AWS authentication by running `aws sts get-caller-identity`.*
*   [Terraform](https://developer.hashicorp.com/terraform/downloads) (v1.3.0+)
*   [kubectl](https://kubernetes.io/docs/tasks/tools/)
*   [Helm](https://helm.sh/docs/intro/install/)

---

## Step 1: Deploy the Infrastructure

The Terraform code will build a VPC, an EKS cluster with Karpenter, Argo CD, and Kargo installed, and an ECS cluster configured with Fargate Spot capacity providers.

```bash
cd terraform
terraform init
terraform apply -auto-approve
```
*(Note: Provisioning the EKS cluster will take approximately 15-20 minutes).*

---

## Step 2: Verify Cluster Status

Once Terraform completes, you can verify the settings and status of the newly created clusters.

### EKS Cluster Status & Endpoint
Connect your local `kubectl` to the new EKS cluster:
```bash
aws eks update-kubeconfig --region us-east-1 --name compute-showcase
```

Test the EKS API server endpoint reachability and view cluster info:
```bash
# Retrieve the public EKS API endpoint URL
aws eks describe-cluster --name compute-showcase --query "cluster.endpoint" --output text

# Verify connection to the Kubernetes control plane
kubectl cluster-info
```

Check the nodes and installed Helm releases (Karpenter, ArgoCD, Kargo):
```bash
kubectl get nodes
kubectl get pods -A
helm list -A
```

### ECS Cluster Status & Endpoint
Unlike EKS, ECS is a fully managed control plane without a dedicated cluster IP. You interact with it via the AWS API.

Verify the ECS cluster is active and reachable via the AWS API:
```bash
aws ecs describe-clusters --clusters compute-showcase-ecs --region us-east-1 --query "clusters[0].{Status:status, ClusterArn:clusterArn}"
```

List the Fargate services running on the cluster:
```bash
aws ecs list-services --cluster compute-showcase-ecs --region us-east-1
```

---

## Step 3: Test Karpenter on EKS

Now that you are connected to the EKS cluster, you can test Karpenter.

### 1. Create an EC2NodeClass and Karpenter NodePool
In Karpenter `v1beta1`, a `NodePool` must reference an `EC2NodeClass` which defines the AWS-specific configuration (like subnets, security groups, and IAM roles).

First, retrieve the IAM Node Role created by Terraform, then apply both the `EC2NodeClass` and `NodePool`:

```bash
# Get the IAM role name used by the EKS managed node group (IAM is global, so this works regardless of region)
NODE_ROLE=$(aws iam list-roles --query "Roles[?contains(RoleName, 'karpenter_core')].RoleName" --output text | awk '{print $1}')

cat <<EOF | kubectl apply -f -
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: "\${NODE_ROLE}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: compute-showcase
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: compute-showcase
---
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 100
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h
EOF
```

### 2. Deploy a Sample Workload
Deploy a simple Nginx deployment with 0 replicas:

```bash
kubectl create deployment inflate --image=public.ecr.aws/eks-distro/kubernetes/pause:3.7 --replicas=0
```

### 3. Trigger Karpenter Scaling
Scale the deployment to 5 replicas. Because the pods will be in a `Pending` state (no room on the core nodes), Karpenter will instantly provision a new EC2 Spot instance to bin-pack them.

```bash
kubectl scale deployment inflate --replicas=5

# Watch the nodes and pods spin up:
kubectl get pods -w
kubectl get nodes -w
```
*Notice how Karpenter provisions a single EC2 node to fit all 5 pods.*

### 4. View Deployments, Services, and Node Attributes

**Using `kubectl`:**
```bash
# View deployments and their status
kubectl get deployments -o wide

# View services
kubectl get svc -o wide

# View detailed pod information and events
kubectl describe pod -l app=inflate

# View node attributes, including capacity types (Spot vs On-Demand) for both EKS and Karpenter
kubectl get nodes -L eks.amazonaws.com/capacityType -L karpenter.sh/capacity-type

# View detailed node allocation and attributes (only works after Karpenter provisions a node)
kubectl describe node -l karpenter.sh/capacity-type=spot
```

---

## Step 4: Test ECS Fargate Spot

The Terraform code already created an ECS Cluster (`compute-showcase-ecs`) and an ECS Service (`sample-service`) with a desired count of 0.

### 1. Trigger Fargate Scaling
Use the AWS CLI to scale the ECS service to 5 tasks:

```bash
aws ecs update-service \
  --cluster compute-showcase-ecs \
  --service sample-service \
  --desired-count 5 \
  --region us-east-1
```

### 2. Watch the Tasks Provision
```bash
aws ecs list-tasks --cluster compute-showcase-ecs --region us-east-1
```
*Notice how Fargate provisions 5 distinct, isolated microVMs (one for each task), rather than bin-packing them onto a single EC2 instance.*

### 3. View Tasks, Services, and Attributes

**Using `ecs-cli`:**
```bash
# Configure ecs-cli with your cluster
ecs-cli configure --cluster compute-showcase-ecs --default-launch-type FARGATE --region us-east-1

# List running tasks in the cluster
ecs-cli ps --cluster compute-showcase-ecs
```

**Using AWS CLI (`aws ecs`):**
```bash
# View service details and deployments
aws ecs describe-services --cluster compute-showcase-ecs --services sample-service --region us-east-1

# View detailed task information (replace <task-arn> with an ARN from list-tasks)
aws ecs describe-tasks --cluster compute-showcase-ecs --tasks <task-arn> --region us-east-1

# View cluster attributes and settings
aws ecs describe-clusters --clusters compute-showcase-ecs --include ATTACHMENTS SETTINGS --region us-east-1
```

---

## Step 5: Test Kargo (GitOps Delivery)

The Terraform code installed Argo CD and Kargo onto your EKS cluster. You can use the Kargo CLI or Kubernetes manifests to create delivery pipelines.

### 1. Install the Kargo CLI (v0.8.0)
*Note: The Kargo CLI version must match the server version (v0.8.0) deployed by Terraform. If you previously installed it via Homebrew, uninstall it first.*

**For Mac (Apple Silicon / M1 / M2):**
```bash
brew uninstall kargo 2>/dev/null || true
curl -sLO https://github.com/akuity/kargo/releases/download/v0.8.0/kargo-darwin-arm64
chmod +x kargo-darwin-arm64
sudo mv kargo-darwin-arm64 /usr/local/bin/kargo
```

**For Mac (Intel):**
```bash
brew uninstall kargo 2>/dev/null || true
curl -sLO https://github.com/akuity/kargo/releases/download/v0.8.0/kargo-darwin-amd64
chmod +x kargo-darwin-amd64
sudo mv kargo-darwin-amd64 /usr/local/bin/kargo
```

**For Linux (AMD64):**
```bash
curl -sLO https://github.com/akuity/kargo/releases/download/v0.8.0/kargo-linux-amd64
chmod +x kargo-linux-amd64
sudo mv kargo-linux-amd64 /usr/local/bin/kargo
```

### 2. Access the Kargo Dashboard & Login
First, start the port-forwarding process in the **background** so it keeps running. The Kargo API service exposes port `443` by default:
```bash
kubectl port-forward svc/kargo-api -n kargo 8443:443 >/dev/null 2>&1 &
sleep 2 # Wait a moment for the port-forward to establish
```

Now, log in to the Kargo API using the default admin credentials. The Terraform code configured the password as `admin`:
```bash
kargo login https://127.0.0.1:8443 --admin --insecure-skip-tls-verify
# When prompted, enter the password: admin
```

*Note: You can also open `https://127.0.0.1:8443` in your browser to view the Kargo UI (accept the self-signed certificate warning).*

### 3. Create a Sample Project & Stages
First, create a Kargo Project (which creates a Kubernetes namespace managed by Kargo):
```bash
kargo create project sample-app
```

Next, define a **Warehouse** (where your artifacts come from) and your **Stages** (`test`, `uat`, `prod`). Because Kargo is GitOps-native, the best way to create these is declaratively using Kubernetes manifests. 

Apply this YAML to your cluster:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: kargo.akuity.io/v1alpha1
kind: Warehouse
metadata:
  name: sample-app
  namespace: sample-app
spec:
  subscriptions:
    - image:
        repoURL: public.ecr.aws/nginx/nginx
        semverConstraint: ^1.24.0
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: test
  namespace: sample-app
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: sample-app
      sources:
        direct: true
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: uat
  namespace: sample-app
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: sample-app
      sources:
        stages:
          - test
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: prod
  namespace: sample-app
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: sample-app
      sources:
        stages:
          - uat
EOF
```

Once applied, open the Kargo UI (`https://127.0.0.1:8443`) and navigate to the `sample-app` project. You will see your pipeline visually represented! You can click on the `test` stage to manually promote the latest discovered "Freight" (the Nginx image), and then promote it through `uat` and `prod`.

---

## Step 6: Cleanup

To avoid incurring ongoing AWS charges, destroy the infrastructure when you are finished experimenting:

```bash
# Delete the EKS workload first so Karpenter cleans up the nodes
kubectl delete deployment inflate
kubectl delete nodepool default
kubectl delete ec2nodeclass default

# Scale ECS back to 0
aws ecs update-service --cluster compute-showcase-ecs --service sample-service --desired-count 0 --region us-east-1

# Destroy the Terraform infrastructure
cd terraform
terraform destroy -auto-approve
```

[![HitCount](https://hits.dwyl.com/elveli/aws-compute-simulator.svg?style=flat)](http://hits.dwyl.com/elveli/aws-compute-simulator
.svg)
