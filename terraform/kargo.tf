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
  repository = "oci://ghcr.io/akuity/kargo-charts"
  chart      = "kargo"
  version    = "0.8.0"

  set_sensitive {
    name  = "api.adminAccount.passwordHash"
    value = "$2b$10$LJ88mIK6ApAHwaiWSJVmt.1a4HDc95iTp/p/UvWQLfbWvQ1/kKFb."
  }

  set_sensitive {
    name  = "api.adminAccount.tokenSigningKey"
    value = "8e6bda8fd47f6b605325d689f0777a70989edfd3d77a19983e897b60e3d78a8d"
  }

  depends_on = [helm_release.argocd]
}
