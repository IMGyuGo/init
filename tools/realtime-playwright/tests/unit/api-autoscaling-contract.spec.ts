import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.describe("API ECS autoscaling Terraform contract", () => {
  test("scales only the API service from one to three tasks at 60 percent CPU", () => {
    const variables = terraformSource("variables.tf");
    const tfvars = terraformSource("env/main.tfvars");
    const ecs = terraformSource("ecs.tf");
    const autoscaling = terraformSource("ecs-autoscaling.tf");
    const outputs = terraformSource("outputs.tf");

    expect(variables).toContain('variable "api_autoscaling"');
    expect(autoscaling).toContain('resource "aws_appautoscaling_target" "api"');
    expect(autoscaling).toContain('scalable_dimension = "ecs:service:DesiredCount"');
    expect(autoscaling).toContain('resource "aws_appautoscaling_policy" "api_cpu"');
    expect(autoscaling).toContain('predefined_metric_type = "ECSServiceAverageCPUUtilization"');
    expect(tfvars).toMatch(/min_capacity\s*=\s*1/);
    expect(tfvars).toMatch(/max_capacity\s*=\s*3/);
    expect(tfvars).toMatch(/cpu_target_percent\s*=\s*60/);
    expect(tfvars).toMatch(/scale_out_cooldown_seconds\s*=\s*60/);
    expect(tfvars).toMatch(/scale_in_cooldown_seconds\s*=\s*300/);
    expect(ecs).toMatch(/resource "aws_ecs_service" "api"[\s\S]*?ignore_changes\s*=\s*\[task_definition, desired_count\]/);
    expect(ecs).toMatch(/moved\s*\{[\s\S]*?aws_ecs_service\.service\["api"\][\s\S]*?aws_ecs_service\.api/);
    expect(ecs).toMatch(/for name, service in local\.services : name => service if name != "api"/);
    expect(outputs).toContain('output "api_autoscaling"');
  });
});

function terraformSource(path: string): string {
  return readFileSync(resolve("../../infra/aws", path), "utf8");
}
