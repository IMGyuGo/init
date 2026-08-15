environment = "main"

root_domain_name = "init-jungle.cloud"

slack_team_id    = "T0B8PCG46J0"
slack_channel_id = "C0BF73MTGUT"

vpc_cidr                 = "10.30.0.0/16"
public_subnet_cidrs      = ["10.30.0.0/24", "10.30.1.0/24"]
private_app_subnet_cidrs = ["10.30.10.0/24", "10.30.11.0/24"]
private_data_subnet_cidrs = [
  "10.30.20.0/24",
  "10.30.21.0/24"
]

desired_counts = {
  frontend = 1
  api      = 1
  worker   = 1
}

api_autoscaling = {
  min_capacity               = 1
  max_capacity               = 3
  cpu_target_percent         = 60
  scale_out_cooldown_seconds = 60
  scale_in_cooldown_seconds  = 300
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

enable_ngrinder = true
ngrinder_allowed_cidr_blocks = [
  "1.238.129.195/32"
]
ngrinder_instance_type = "t3.medium"

# Playwright load-test EC2 is kept in Terraform code, but disabled after testing.
# Turn this back to true and increase the count when another browser load test is needed.
enable_playwright_loadtest            = false
playwright_loadtest_instance_count    = 0
playwright_loadtest_instance_type     = "m7i.xlarge"
playwright_loadtest_rows_per_instance = 15
