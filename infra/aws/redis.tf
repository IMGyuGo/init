resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = values(aws_subnet.private_data)[*].id

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "${local.name_prefix} Valkey cache"

  engine               = "valkey"
  engine_version       = "7.2"
  node_type            = "cache.t4g.micro"
  port                 = 6379
  parameter_group_name = "default.valkey7"

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
  snapshot_retention_limit   = var.redis_snapshot_retention_days

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}
