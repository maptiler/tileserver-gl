terragrunt = {
  remote_state {
    backend = "s3"
    config {
      bucket         = "tg-state-eu-central-1"
      key            = "${path_relative_to_include()}/terraform.tfstate"
      region         = "eu-central-1"
      encrypt        = true
      dynamodb_table = "terragrunt-lock-table-eu-central-1"
    }
  }
  extra_arguments "common_vars" {
      commands = ["${get_terraform_commands_that_need_vars()}"]
      optional_var_files = [
        "${get_tfvars_dir()}/${find_in_parent_folders("region.tfvars", "skip-region-if-does-not-exist")}",
        "${get_tfvars_dir()}/${find_in_parent_folders("environment.tfvars", "skip-env-if-does-not-exist")}",
        "${get_tfvars_dir()}/terraform.tfvars"
      ]
  }
}