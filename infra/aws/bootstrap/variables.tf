variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket name for Terraform remote state. Example: init-tfstate-123456789012-ap-northeast-2"
}

variable "root_domain_name" {
  type        = string
  description = "Root domain name to host in Route53."
  default     = "init-jungle.cloud"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository associated with this Terraform bootstrap stack."
  default     = "seok3m4/init"
}

variable "owner" {
  type        = string
  description = "Owner tag value for bootstrap resources."
  default     = "A"
}

variable "github_oidc_thumbprints" {
  type        = list(string)
  description = "Thumbprints required by the IAM OIDC provider resource."
  default     = ["22ff89586561fc2d52f77491e9f1eff1b80be33e"]
}
