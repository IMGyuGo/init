environment = "main"

root_domain_name = "init-jungle.cloud"

vpc_cidr                 = "10.30.0.0/16"
public_subnet_cidrs      = ["10.30.0.0/24", "10.30.1.0/24"]
private_app_subnet_cidrs = ["10.30.10.0/24", "10.30.11.0/24"]
private_data_subnet_cidrs = [
  "10.30.20.0/24",
  "10.30.21.0/24"
]

desired_counts = {
  frontend = 0
  api      = 0
  worker   = 0
}

capacity_provider_by_service = {
  frontend = "FARGATE"
  api      = "FARGATE"
  worker   = "FARGATE"
}

rds_backup_retention_days      = 7
rds_deletion_protection        = true
rds_skip_final_snapshot        = false
rds_apply_immediately          = false
redis_snapshot_retention_days  = 1
asset_bucket_versioning_status = "Enabled"
