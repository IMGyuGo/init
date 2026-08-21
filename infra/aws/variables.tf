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

variable "enable_ngrinder" {
  description = "Whether to create a temporary public EC2 instance for nGrinder load testing."
  type        = bool
  default     = false
}

variable "ngrinder_allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the nGrinder controller UI on port 8080. Use your current public IP as /32."
  type        = list(string)
  default     = []

  validation {
    condition     = !var.enable_ngrinder || length(var.ngrinder_allowed_cidr_blocks) > 0
    error_message = "ngrinder_allowed_cidr_blocks must include at least one CIDR when enable_ngrinder is true."
  }

  validation {
    condition = alltrue([
      for cidr in var.ngrinder_allowed_cidr_blocks : can(cidrhost(cidr, 0))
    ])
    error_message = "ngrinder_allowed_cidr_blocks values must be valid CIDR blocks, for example 203.0.113.10/32."
  }
}

variable "ngrinder_subnet_key" {
  description = "Public subnet key where the nGrinder EC2 instance is placed."
  type        = string
  default     = "public-1"
}

variable "ngrinder_instance_type" {
  description = "EC2 instance type for the nGrinder controller and local agent."
  type        = string
  default     = "t3.medium"
}

variable "ngrinder_root_volume_size_gb" {
  description = "Root EBS volume size for the nGrinder EC2 instance."
  type        = number
  default     = 30

  validation {
    condition     = var.ngrinder_root_volume_size_gb >= 20
    error_message = "ngrinder_root_volume_size_gb must be at least 20."
  }
}

variable "ngrinder_controller_port" {
  description = "nGrinder controller web UI port."
  type        = number
  default     = 8080

  validation {
    condition     = var.ngrinder_controller_port > 0 && var.ngrinder_controller_port < 65536
    error_message = "ngrinder_controller_port must be a valid TCP port."
  }
}

variable "ngrinder_controller_download_url" {
  description = "Download URL for the nGrinder controller WAR."
  type        = string
  default     = "https://github.com/naver/ngrinder/releases/download/ngrinder-3.5.9-p1-20240613/ngrinder-controller-3.5.9-p1.war"
}

variable "ngrinder_agent_enabled" {
  description = "Whether user_data should download and run a local nGrinder agent from the controller."
  type        = bool
  default     = true
}

variable "enable_playwright_loadtest" {
  description = "Whether to create temporary public EC2 instances for Playwright realtime interview load testing."
  type        = bool
  default     = false
}

variable "playwright_loadtest_instance_count" {
  description = "Number of Playwright load test EC2 instances. Start small, then increase for distributed browser load testing."
  type        = number
  default     = 1

  validation {
    condition     = var.playwright_loadtest_instance_count >= 0 && var.playwright_loadtest_instance_count <= 10
    error_message = "playwright_loadtest_instance_count must be between 0 and 10."
  }
}

variable "playwright_loadtest_rows_per_instance" {
  description = "Number of interview token CSV rows assigned to each Playwright load test EC2 instance."
  type        = number
  default     = 20

  validation {
    condition     = var.playwright_loadtest_rows_per_instance >= 1
    error_message = "playwright_loadtest_rows_per_instance must be at least 1."
  }
}

variable "playwright_loadtest_subnet_keys" {
  description = "Public subnet keys used by Playwright load test EC2 instances, rotated by instance index."
  type        = list(string)
  default     = ["public-1", "public-2"]

  validation {
    condition     = length(var.playwright_loadtest_subnet_keys) > 0
    error_message = "playwright_loadtest_subnet_keys must include at least one public subnet key."
  }
}

variable "playwright_loadtest_instance_type" {
  description = "EC2 instance type for Playwright realtime interview load testing."
  type        = string
  default     = "t3.large"
}

variable "playwright_loadtest_root_volume_size_gb" {
  description = "Root EBS volume size for each Playwright load test EC2 instance."
  type        = number
  default     = 40

  validation {
    condition     = var.playwright_loadtest_root_volume_size_gb >= 30
    error_message = "playwright_loadtest_root_volume_size_gb must be at least 30."
  }
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

variable "api_autoscaling" {
  description = "API ECS Service Auto Scaling target tracking settings."
  type = object({
    min_capacity               = number
    max_capacity               = number
    cpu_target_percent         = number
    scale_out_cooldown_seconds = number
    scale_in_cooldown_seconds  = number
  })
  default = {
    min_capacity               = 1
    max_capacity               = 3
    cpu_target_percent         = 60
    scale_out_cooldown_seconds = 60
    scale_in_cooldown_seconds  = 300
  }

  validation {
    condition = (
      floor(var.api_autoscaling.min_capacity) == var.api_autoscaling.min_capacity &&
      floor(var.api_autoscaling.max_capacity) == var.api_autoscaling.max_capacity &&
      var.api_autoscaling.min_capacity >= 1 &&
      var.api_autoscaling.max_capacity >= var.api_autoscaling.min_capacity &&
      var.api_autoscaling.max_capacity <= 3 &&
      var.api_autoscaling.cpu_target_percent > 0 &&
      var.api_autoscaling.cpu_target_percent <= 100 &&
      floor(var.api_autoscaling.scale_out_cooldown_seconds) == var.api_autoscaling.scale_out_cooldown_seconds &&
      floor(var.api_autoscaling.scale_in_cooldown_seconds) == var.api_autoscaling.scale_in_cooldown_seconds &&
      var.api_autoscaling.scale_out_cooldown_seconds >= 0 &&
      var.api_autoscaling.scale_in_cooldown_seconds >= 0
    )
    error_message = "api_autoscaling must use min>=1, min<=max<=3, CPU 1..100, and non-negative integer cooldowns."
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
  description = "Bootstrap image tag for task definitions. Deploy workflow replaces live ECS services with target branch head SHA tags."
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

variable "github_deploy_environment_name" {
  description = "GitHub Environment name allowed to assume the deploy role. Defaults to the Terraform name prefix, for example init-main."
  type        = string
  default     = ""
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN. If empty, derive the standard account-level ARN. Bootstrap must create or import this provider first."
  type        = string
  default     = ""
}

variable "slack_team_id" {
  description = "Slack workspace/team ID authorized in Amazon Q Developer in chat applications."
  type        = string

  validation {
    condition     = can(regex("^T[A-Z0-9]+$", var.slack_team_id))
    error_message = "slack_team_id must look like a Slack workspace/team ID, for example T0123456789."
  }
}

variable "slack_channel_id" {
  description = "Slack channel ID that receives main environment operations alerts."
  type        = string

  validation {
    condition     = can(regex("^[CG][A-Z0-9]+$", var.slack_channel_id))
    error_message = "slack_channel_id must look like a Slack public/private channel ID, for example C0123456789 or G0123456789."
  }
}
