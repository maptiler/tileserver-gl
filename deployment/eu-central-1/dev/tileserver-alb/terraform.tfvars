terragrunt = {
  include {
    path = "${find_in_parent_folders()}"
  }
  terraform {
    source = "git::ssh://git@github.com/monosolutions/terraform-modules.git//mono-alb"
  }
}
region = "eu-central-1"
environment = "dev"
alb_name = "tileserver-alb"
alb_subnets = []
ingress = [
  {
      from_port = 80
      to_port = 80
      protocol = "tcp"
      cidr_blocks = "0.0.0.0/0"
  }
]
ingress_count = 1
egress = [
  {
      from_port = 0
      to_port = 0
      protocol = "-1"
      cidr_blocks = "0.0.0.0/0"
    }
]
egress_count = 1
vpc_remote_state = "dev/vpc/terraform.tfstate"
state_bucket = "tg-state-eu-central-1"
