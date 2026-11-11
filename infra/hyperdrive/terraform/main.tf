# openproduct's own Hyperdrive: one config per environment over that
# environment's Supabase project (`openproduct-{env}`).
#
# Taken from orun-cloud ffb71be69 (apps/openproduct/infra/hyperdrive) as it
# is, with the changes this repository forces (openproduct-standalone design
# §11), made the way lumen's cloudflare-hyperdrive stack makes them:
#   - state is on the platform (http backend), not in S3;
#   - the origin comes from SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD,
#     which openproduct-supabase publishes, instead of a Secrets Manager read;
#   - the wiring manifest leaves as the `wiring` output, which the composition
#     publishes as WIRING_OPENPRODUCT_HYPERDRIVE (component.yaml
#     secretOutputs), instead of a Secrets Manager secret. So there is no AWS
#     provider at all;
#   - the provider reads CLOUDFLARE_API_TOKEN from the environment.
# The resource, its name, the cloudflare ~> 4.30 pin and caching are unchanged.

terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job, so
  # this block stays empty. No bucket, no role, no workspaces.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): a
# hyperdrive-edit token brokered from the openproduct Cloudflare connection,
# resolved into the job env by orun, so it never transits a variable.
provider "cloudflare" {}

# --- Variables (standard Orun parameters) ---

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from the CLOUDFLARE_ACCOUNT_ID secret)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "pullely"
}

variable "repo" {
  type    = string
  default = "openproduct"
}

variable "namespace" {
  type    = string
  default = "sourceplane"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "openproduct-hyperdrive"
}

variable "stackName" {
  type    = string
  default = "openproduct-hyperdrive"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- Supabase origin (from workspace secrets, not Secrets Manager) ---
#
# openproduct-supabase publishes its outputs to this environment's secrets
# (SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD); component.yaml maps them to
# these variables. Host, port, database and user derive from the project ref,
# the same derivation the old Secrets Manager payload carried. Required, with
# no default, so a missing secret fails the plan.

variable "supabase_project_ref" {
  type        = string
  description = "Supabase project reference (from the SUPABASE_PROJECT_REF secret)"
}

variable "supabase_db_password" {
  type        = string
  sensitive   = true
  description = "Supabase database password (from the SUPABASE_DB_PASSWORD secret)"
}

locals {
  database_host = "db.${var.supabase_project_ref}.supabase.co"
  database_port = 5432
  database_name = "postgres"
  database_user = "postgres"

  hyperdrive_name = "${var.namespacePrefix}openproduct-${var.environment}"
}

# --- Create Hyperdrive resource ---

resource "cloudflare_hyperdrive_config" "postgres" {
  account_id = var.cloudflare_account_id
  name       = local.hyperdrive_name

  origin = {
    scheme   = "postgres"
    host     = local.database_host
    port     = local.database_port
    database = local.database_name
    user     = local.database_user
    password = var.supabase_db_password
  }

  caching = {
    disabled = false
  }
}

# --- Wiring manifest ---
#
# Published by the composition's secretOutputs step as the
# WIRING_OPENPRODUCT_HYPERDRIVE secret on this environment's rung. core's
# deploy reads it back as WIRING_OPENPRODUCT_HYPERDRIVE_<ENV> and renders its
# committed @@wiring(openproduct-hyperdrive/<env>:hyperdrive_id)@@ tokens from
# it. Same document shape the Secrets Manager version carried.

output "wiring" {
  description = "Wiring document for core's deploy-time binding resolution (published as WIRING_OPENPRODUCT_HYPERDRIVE)"
  value = jsonencode({
    hyperdrive_id   = cloudflare_hyperdrive_config.postgres.id
    hyperdrive_name = cloudflare_hyperdrive_config.postgres.name
  })
}

# --- Outputs (non-secret) ---

output "hyperdrive_id" {
  description = "Cloudflare Hyperdrive config ID"
  value       = cloudflare_hyperdrive_config.postgres.id
}

output "hyperdrive_name" {
  description = "Cloudflare Hyperdrive config name"
  value       = cloudflare_hyperdrive_config.postgres.name
}

output "hyperdrive_connection_string" {
  description = "Hyperdrive-formatted connection string for Workers (to be used in bindings)"
  # Note: actual connection string is built at binding time; this is the resource ID
  value = "hyperdrive://${cloudflare_hyperdrive_config.postgres.id}"
}

output "database_host" {
  description = "Database host (derived from the Supabase project ref)"
  value       = local.database_host
  sensitive   = true
}
