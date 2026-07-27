locals {
  common_tags = {
    Project     = "jungle-init"
    Environment = "bootstrap"
    ManagedBy   = "terraform"
    Repository  = var.github_repository
    Owner       = var.owner
  }
}
