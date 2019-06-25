output "this_security_group_id" {
  value = "${aws_security_group.this.id}"
}

output "this_group_name" {
  value = "${aws_autoscaling_group.autoscalinggroup.name}"
}

output "this_group_policy_up_arn" {
  value = "${aws_autoscaling_policy.this-autoscale_group_policy_up_x1.arn}"
}

output "this_group_policy_down_arn" {
  value = "${aws_autoscaling_policy.this-autoscale_group_policy_down_x1.arn}"
}