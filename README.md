# AWS Compute & Delivery Showcase 🚀

This repository contains **Infrastructure as Code (Terraform)** to deploy and compare modern AWS compute scaling and GitOps delivery paradigms:
1. **Karpenter on Amazon EKS:** Group-less node autoscaling that observes pending pods and provisions right-sized EC2 Spot instances.
2. **Amazon ECS with Fargate Spot:** Serverless compute that provisions individual microVMs (1:1 ratio) for each task without managing underlying EC2 nodes.
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

### 1. Create a Karpenter NodePool
Apply a default NodePool so Karpenter knows what types of instances it is allowed to provision:

```bash
cat <<EOF | kubectl apply -f -
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

---

## Step 5: Test Kargo (GitOps Delivery)

The Terraform code installed Argo CD and Kargo onto your EKS cluster. You can use the Kargo CLI or Kubernetes manifests to create delivery pipelines.

### 1. Install the Kargo CLI
```bash
brew tap akuity/kargo
brew install kargo
```

### 2. Access the Kargo Dashboard
Port-forward the Kargo API server to access the UI:
```bash
kubectl port-forward svc/kargo-api -n kargo 8080:80
# Open http://localhost:8080 in your browser
```

### 3. Create a Sample Project
You can now create a Kargo Project, Stages (e.g., `test`, `uat`, `prod`), and promote `Freight` (container images/Helm charts) between them using the Kargo UI or CLI.

```bash
kargo create project sample-app
```

---

## Step 6: Cleanup

To avoid incurring ongoing AWS charges, destroy the infrastructure when you are finished experimenting:

```bash
# Delete the EKS workload first so Karpenter cleans up the nodes
kubectl delete deployment inflate
kubectl delete nodepool default

# Scale ECS back to 0
aws ecs update-service --cluster compute-showcase-ecs --service sample-service --desired-count 0 --region us-east-1

# Destroy the Terraform infrastructure
cd terraform
terraform destroy -auto-approve
```
