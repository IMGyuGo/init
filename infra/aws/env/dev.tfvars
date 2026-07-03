environment = "dev"

root_domain_name = "init-jungle.cloud"

vpc_cidr                 = "10.20.0.0/16"
public_subnet_cidrs      = ["10.20.0.0/24", "10.20.1.0/24"]
private_app_subnet_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]
private_data_subnet_cidrs = [
  "10.20.20.0/24",
  "10.20.21.0/24"
]

desired_counts = {
  frontend = 0
  api      = 0
  worker   = 0
}

capacity_provider_by_service = {
  frontend = "FARGATE_SPOT"
  api      = "FARGATE_SPOT"
  worker   = "FARGATE_SPOT"
}

rds_backup_retention_days      = 1
rds_deletion_protection        = false
rds_skip_final_snapshot        = true
rds_apply_immediately          = true
redis_snapshot_retention_days  = 0
asset_bucket_versioning_status = "Suspended"
