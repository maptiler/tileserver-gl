terragrunt = {
  include {
    path = "${find_in_parent_folders()}"
  }
  terraform {
    source = "/tmp/repo/deployment/modules/tileserver"
  }
}
region = "eu-central-1"
environment = "dev"
instance_type = "t2.large"
mono_vpc_remote_state = "dev/vpc/terraform.tfstate"
mono_alb_remote_state = "dev/tileserver-alb/terraform.tfstate"
mono_keypair_remote_state = "dev/mono-keypair/terraform.tfstate"
mono_efs_remote_state = "dev/mono-efs/terraform.tfstate"
mono_region = "fra"
version = "2.1"
state_bucket = "tg-state-eu-central-1"
repo_version =