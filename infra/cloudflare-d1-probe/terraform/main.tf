# The D1 probe database, RETIRED (openproduct-standalone OPN, task OPN-5,
# milestone OPN2).
#
# OPN1 ended in a no-go for D1 (OPN-3, 2026-11-11), so this component now
# declares no database. Its apply on the merge that retires the trial does two
# things, both in stage, the only environment it ever existed in:
#
#   - destroys `openproduct-probe-stage`: the database is in state and no
#     longer in config, so terraform plans its destroy;
#   - deletes the probe Worker, `openproduct-d1-probe-stage`, through the
#     Cloudflare API, because no component manages that script and
#     stack-tectonic's Worker composition has no delete path.
#
# The next task deletes this component, once this apply has run, so its state
# is never orphaned with live resources behind it. State lives on the platform
# (SB1); the runner exports TF_HTTP_* per job.

terraform {
  required_version = ">= 1.15.0"

  backend "http" {}

  required_providers {
    # v5, the provider that created the database: its destroy reads the
    # state written with v5's schema.
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): the
# token is an orun-managed secret (d1-edit) resolved into the job env at run
# time, so it never transits Terraform variables.
provider "cloudflare" {}

# --- Variables (standard Orun parameters; the composition exports every
#     component parameter as TF_VAR_<name>) ---

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from the CLOUDFLARE_ACCOUNT_ID secret, as TF_VAR_cloudflare_account_id)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "sourceplane"
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

  # The probe is stage-only. The component subscribes to stage alone; this
  # makes a plan in any other environment fail rather than create a second
  # probe database.
  validation {
    condition     = var.environment == "stage"
    error_message = "cloudflare-d1-probe is stage-only: the probe database must not exist in any other environment."
  }
}

variable "component" {
  type    = string
  default = "cloudflare-d1-probe"
}

variable "stackName" {
  type    = string
  default = "cloudflare-d1-probe"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

locals {
  # The script wrangler deployed for the probe's `stage` environment
  # (infra/d1-probe/wrangler.template.jsonc, name `openproduct-d1-probe`).
  probe_worker_name = "openproduct-d1-probe-${var.environment}"
}

# Runs once, at apply, never at plan: a pull request's plan-only lane shows it
# as "will be created" and deletes nothing. The token is the deploy profile's
# workers-deploy token (CLOUDFLARE_WORKERS_TOKEN in component.yaml), since the
# job's CLOUDFLARE_API_TOKEN is the D1-only token. A 404 means the script is
# already gone, which is the state this wants.
resource "terraform_data" "retire_probe_worker" {
  input = local.probe_worker_name

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      out="$(mktemp)"
      trap 'rm -f "$out"' EXIT
      url="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/${local.probe_worker_name}?force=true"
      code="$(curl -sS --retry 3 -o "$out" -w '%%{http_code}' -X DELETE \
        -H "Authorization: Bearer $CLOUDFLARE_WORKERS_TOKEN" "$url")"
      case "$code" in
        200) echo "retired: deleted Worker ${local.probe_worker_name}" ;;
        404) echo "retired: Worker ${local.probe_worker_name} was already gone" ;;
        *) echo "deleting Worker ${local.probe_worker_name} failed: HTTP $code"; jq -c '.errors // .' "$out" || true; exit 1 ;;
      esac
    EOT
  }
}

output "retired_worker" {
  description = "The probe Worker this apply deleted (or found already gone)"
  value       = terraform_data.retire_probe_worker.output
}
