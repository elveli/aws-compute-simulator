# Install Argo CD (Prerequisite for Kargo)
resource "helm_release" "argocd" {
  namespace        = "argocd"
  create_namespace = true

  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = "5.51.6"

  set {
    name  = "server.extraArgs"
    value = "{--insecure}"
  }
}

# Install Kargo
resource "helm_release" "kargo" {
  namespace        = "kargo"
  create_namespace = true

  name       = "kargo"
  repository = "https://charts.kargo.akuity.io"
  chart      = "kargo"
  version    = "0.8.0"

  depends_on = [helm_release.argocd]
}
