variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket name for Terraform remote state. Example: init-tfstate-123456789012-ap-northeast-2"
}

variable "github_oidc_thumbprints" {
  type        = list(string)
  description = "Thumbprints required by the IAM OIDC provider resource."
  default     = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}
