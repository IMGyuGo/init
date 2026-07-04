variable "aws_region" {
  description = "AWS region for all regional resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Deployment environment. The live AWS stack is shared by dev and main branch deploys."
  type        = string

  validation {
    condition     = var.environment == "main"
    error_message = "environment must be main."
  }
}

variable "project_name" {
  description = "Project resource name prefix."
  type        = string
  default     = "init"
}

variable "root_domain_name" {
  description = "Root domain hosted in Route53 and used by the shared live environment."
  type        = string
  default     = "init-jungle.cloud"
}

variable "vpc_cidr" {
  description = "CIDR block for the environment VPC."
  type        = string
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs for ALB and NAT Gateway."
  type        = list(string)
}

variable "private_app_subnet_cidrs" {
  description = "Two private application subnet CIDRs for ECS tasks."
  type        = list(string)
}

variable "private_data_subnet_cidrs" {
  description = "Two private data subnet CIDRs for RDS and Redis."
  type        = list(string)
}

variable "admin_cidr_blocks" {
  description = "Optional temporary ALB direct access CIDRs. Empty by default; CloudFront ingress remains the primary path."
  type        = list(string)
  default     = []
}

variable "enable_interface_endpoints" {
  description = "Cost-sensitive interface VPC endpoint toggles. NAT remains the default outbound path."
  type = object({
    ecr_api        = bool
    ecr_dkr        = bool
    logs           = bool
    secretsmanager = bool
    sqs            = bool
  })
  default = {
    ecr_api        = false
    ecr_dkr        = false
    logs           = false
    secretsmanager = false
    sqs            = false
  }
}

variable "desired_counts" {
  description = "Initial ECS desired counts. Keep zero until images and Secrets Manager values are seeded."
  type = object({
    frontend = number
    api      = number
    worker   = number
  })
  default = {
    frontend = 0
    api      = 0
    worker   = 0
  }
}

variable "capacity_provider_by_service" {
  description = "ECS capacity provider per service."
  type = object({
    frontend = string
    api      = string
    worker   = string
  })
  default = {
    frontend = "FARGATE"
    api      = "FARGATE"
    worker   = "FARGATE"
  }
}

variable "image_tag" {
  description = "Bootstrap image tag for task definitions. Deploy workflow will replace this with github.sha."
  type        = string
  default     = "bootstrap"
}

variable "postgres_engine_version" {
  description = "RDS PostgreSQL engine version."
  type        = string
  default     = "16"
}

variable "rds_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_backup_retention_days" {
  description = "RDS automated backup retention in days."
  type        = number
}

variable "rds_deletion_protection" {
  description = "Whether RDS deletion protection is enabled."
  type        = bool
}

variable "rds_skip_final_snapshot" {
  description = "Whether RDS skips a final snapshot on destroy."
  type        = bool
}

variable "rds_apply_immediately" {
  description = "Whether RDS changes are applied immediately."
  type        = bool
}

variable "redis_snapshot_retention_days" {
  description = "ElastiCache snapshot retention in days."
  type        = number
}

variable "asset_bucket_versioning_status" {
  description = "S3 asset bucket versioning status: Enabled or Suspended."
  type        = string

  validation {
    condition     = contains(["Enabled", "Suspended"], var.asset_bucket_versioning_status)
    error_message = "asset_bucket_versioning_status must be Enabled or Suspended."
  }
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role."
  type        = string
  default     = "seok3m4/init"
}

variable "github_allowed_branches" {
  description = "Git branches allowed to assume the deploy role."
  type        = list(string)
  default     = ["dev", "main"]
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN. If empty, derive the standard account-level ARN. Bootstrap must create or import this provider first."
  type        = string
  default     = ""
}

variable "enable_ses_domain_identity" {
  description = "Create SES domain identity and Route53 verification records."
  type        = bool
  default     = false
}

variable "ses_domain_name" {
  description = "SES domain identity name when enable_ses_domain_identity is true."
  type        = string
  default     = ""
}

variable "ses_mail_from_subdomain" {
  description = "Subdomain prefix for SES custom MAIL FROM. Example: mail -> mail.example.com."
  type        = string
  default     = "mail"
}

variable "ses_mail_from_behavior_on_mx_failure" {
  description = "SES behavior if the custom MAIL FROM MX record cannot be read."
  type        = string
  default     = "UseDefaultValue"

  validation {
    condition     = contains(["UseDefaultValue", "RejectMessage"], var.ses_mail_from_behavior_on_mx_failure)
    error_message = "ses_mail_from_behavior_on_mx_failure must be UseDefaultValue or RejectMessage."
  }
}
