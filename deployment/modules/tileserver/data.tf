data "aws_caller_identity" "current" {}
data "aws_elb_service_account" "main" {}

data "aws_availability_zones" "all" {}

data "aws_ami" "amazon_linux" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-bionic-18.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

data "terraform_remote_state" "mono_vpc" {
  backend = "s3"
  config {
    bucket = "${var.state_bucket}"
    key    = "${var.mono_vpc_remote_state}"
    region = "${var.region}"
  }
}

data "template_file" "cloud_init" {
  template = "${file("files/cloud-init.cfg")}"
}

data "template_file" "shell-script" {
  template = "${file("files/user-data.sh")}"
  vars {
    efs_dns_name = "${data.terraform_remote_state.mono_efs.efs_dns_name}"
    region = "${var.region}"
    mono_region = "${var.mono_region}"
    repo_version = "${var.repo_version}"
    environment = "${var.environment}"
  }
}

data "template_cloudinit_config" "cloudinit" {
  part {
    filename     = "init.cfg"
    content_type = "text/cloud-config"
    content      = "${data.template_file.cloud_init.rendered}"
  }

  part {
    content_type = "text/x-shellscript"
    content      = "${data.template_file.shell-script.rendered}"
  }
}

data "terraform_remote_state" "mono_efs" {
  backend = "s3"
  config {
    bucket = "${var.state_bucket}"
    key = "${var.mono_efs_remote_state}"
    region = "${var.region}"
  }
}

data "terraform_remote_state" "mono_keypair" {
  backend = "s3"
  config {
    bucket = "${var.state_bucket}"
    key = "${var.mono_keypair_remote_state}"
    region = "${var.region}"
  }
}

data "terraform_remote_state" "mono_alb" {
  backend = "s3"
  config {
    bucket = "${var.state_bucket}"
    key = "${var.mono_alb_remote_state}"
    region = "${var.region}"
  }
}