resource "aws_launch_configuration" "launchconfiguration" {
  name_prefix          = "maps-${var.environment}-${var.version}-"
  image_id             = "${data.aws_ami.amazon_linux.id}"
  key_name             = "${data.terraform_remote_state.mono_keypair.key_name}"
  iam_instance_profile = "${aws_iam_instance_profile.profile.name}"
  security_groups      = ["${aws_security_group.this.id}", 
    "${data.terraform_remote_state.mono_efs.ec2_security_group_id}"]
  instance_type        = "${var.instance_type}"
  user_data            = "${data.template_cloudinit_config.cloudinit.rendered}"
  ebs_optimized        = false
  root_block_device {
    delete_on_termination = true
    volume_size = 50
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "autoscalinggroup" {
  vpc_zone_identifier  = ["${data.terraform_remote_state.mono_vpc.sn_private_a_id}"]
  name          = "${aws_launch_configuration.launchconfiguration.name}"
  launch_configuration = "${aws_launch_configuration.launchconfiguration.name}"
  max_size             = 5
  desired_capacity     = 1
  min_size             = 1
  default_cooldown = 60
  health_check_grace_period = 300
  health_check_type = "ELB"
  force_delete = true
  termination_policies = ["OldestInstance", "OldestLaunchConfiguration"]

  target_group_arns = ["${aws_alb_target_group.target_group_this.arn}"]
  enabled_metrics = ["GroupMinSize", "GroupMaxSize", 
    "GroupDesiredCapacity", "GroupInServiceInstances", 
    "GroupPendingInstances", "GroupStandbyInstances", 
    "GroupTerminatingInstances", "GroupTotalInstances"]
  
  lifecycle {
    create_before_destroy = true
  }

  tag {
    key                 = "Name"
    value               = "maps"
    propagate_at_launch = true
  }

  provisioner "local-exec" {
    # Unwrap to read
    # For every instance of the autoscaling group wait to get 3 "healthy" checks efore taking down the old autoscaling group
    command = "echo \"Waiting for instances spinup (2m)\"; sleep 120; current=0; required=3; instances=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-name \"${aws_autoscaling_group.autoscalinggroup.name}\" --query 'AutoScalingGroups[*].Instances[*].InstanceId' --output text); for i in $(echo $instances); do check=$(aws elbv2 describe-target-health --target-group-arn \"${aws_alb_target_group.target_group_this.arn}\" --query \"TargetHealthDescriptions[?Target.Id == '$i'].TargetHealth.State\" --output text); while true; if [ \"$current\" == \"$required\" ]; then break;fi; if [ \"$check\" == \"healthy\" ]; then current=$((++current)); fi; do echo \"check = $check\"; echo \"Waiting for instance $i startup\"; sleep 15; check=$(aws elbv2 describe-target-health --target-group-arn \"${aws_alb_target_group.target_group_this.arn}\" --query \"TargetHealthDescriptions[?Target.Id == '$i'].TargetHealth.State\" --output text); done; current=0; done; echo \"Got 3 healthy checks in a row, proceeding...\"; sleep 10"
  }
}

#
# Autoscaling policies
#
resource "aws_autoscaling_policy" "this-autoscale_group_policy_up_x1" {
  name = "maps-autoscale_group_policy_up_x1"
  scaling_adjustment = 1
  adjustment_type = "ChangeInCapacity"
  cooldown = 60
  autoscaling_group_name = "${aws_autoscaling_group.autoscalinggroup.name}"
}

resource "aws_autoscaling_policy" "this-autoscale_group_policy_down_x1" {
  name = "maps-autoscale_group_policy_down_x1"
  scaling_adjustment = -1
  adjustment_type = "ChangeInCapacity"
  cooldown = 60
  autoscaling_group_name = "${aws_autoscaling_group.autoscalinggroup.name}"
}

#
# ASG alarms
#

resource "aws_cloudwatch_metric_alarm" "this-cpu_high_alarm" {
  alarm_name = "alarm-cpu-high-maps"
  alarm_description = "This alarm triggers when CPU load in Autoscaling group is high."
 
  metric_name = "CPUUtilization"
  namespace = "AWS/EC2"
  dimensions {
    AutoScalingGroupName = "${aws_autoscaling_group.autoscalinggroup.name}"
  }
  statistic = "Average"

  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods = "1"
  
  period = "60"
  threshold = "70"
  
  # Use autoscaling policy ARN as an alarm action here
  # Reference: http://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html
  alarm_actions = [
    "${aws_autoscaling_policy.this-autoscale_group_policy_up_x1.arn}",
  ]
  dimensions {
    AutoScalingGroupName = "${aws_autoscaling_group.autoscalinggroup.name}"
  }
}

resource "aws_cloudwatch_metric_alarm" "this-cpu_low_alarm" {
  alarm_name = "alarm-cpu-low-maps"
  alarm_description = "This alarm triggers when CPU load in Autoscaling group is low."

  metric_name = "CPUUtilization"
  namespace = "AWS/EC2"
  dimensions {
    AutoScalingGroupName = "${aws_autoscaling_group.autoscalinggroup.name}"
  }
  statistic = "Average"

  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods = "1"

  period = "60"
  threshold = "35"

  # Use autoscaling policy ARN as an alarm action here
  # Reference: http://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html
  alarm_actions = [
    "${aws_autoscaling_policy.this-autoscale_group_policy_down_x1.arn}",
  ]
  dimensions {
    AutoScalingGroupName = "${aws_autoscaling_group.autoscalinggroup.name}"
  }
}