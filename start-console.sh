#!/usr/bin/env bash

set -euo pipefail

CONSOLE_IMAGE=${CONSOLE_IMAGE:="quay.io/openshift/origin-console:4.20"}
CONSOLE_PORT=${CONSOLE_PORT:=9000}
CONSOLE_IMAGE_PLATFORM=${CONSOLE_IMAGE_PLATFORM:="linux/amd64"}

# Plugin metadata is declared in package.json
PLUGIN_NAME=${npm_package_consolePlugin_name}

echo "Starting local OpenShift console..."

BRIDGE_USER_AUTH="disabled"
BRIDGE_K8S_MODE="off-cluster"
BRIDGE_K8S_AUTH="bearer-token"
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT=$(oc whoami --show-server)
# The monitoring operator is not always installed (e.g. for local OpenShift). Tolerate missing config maps.
set +e
BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.thanosPublicURL}' 2>/dev/null)
BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER=$(oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath='{.data.alertmanagerPublicURL}' 2>/dev/null)
set -e
BRIDGE_K8S_AUTH_BEARER_TOKEN=$(oc whoami --show-token 2>/dev/null)
BRIDGE_USER_SETTINGS_LOCATION="localstorage"
BRIDGE_I18N_NAMESPACES="plugin__${PLUGIN_NAME}"

# Don't fail if the cluster doesn't have gitops.
set +e
GITOPS_HOSTNAME=$(oc -n openshift-gitops get route cluster -o jsonpath='{.spec.host}' 2>/dev/null)
set -e
if [ -n "$GITOPS_HOSTNAME" ]; then
    BRIDGE_K8S_MODE_OFF_CLUSTER_GITOPS="https://$GITOPS_HOSTNAME"
fi

echo "API Server: $BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT"
echo "Console Image: $CONSOLE_IMAGE"
# echo "Console URL: http://rhel9:${CONSOLE_PORT}"
echo "Console Platform: $CONSOLE_IMAGE_PLATFORM"

# Automatically detect the primary IP address of the default route's interface
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    DEFAULT_INTERFACE=$(route -n get default 2>/dev/null | grep interface | awk '{print $2}')
    HOST_IP=$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null)
else
    # Linux
    DEFAULT_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
    HOST_IP=$(ip addr show "$DEFAULT_INTERFACE" 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d/ -f1 | head -n1)
fi

if [ -z "$HOST_IP" ]; then
    echo "Warning: Could not automatically detect host IP. Falling back to localhost."
    HOST_IP="127.0.0.1"
else
    echo "Detected Host IP: $HOST_IP"
fi

BRIDGE_PLUGINS="${PLUGIN_NAME}=http://${HOST_IP}:9001"

podman run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm --network=host --env-file <(set | grep BRIDGE) $CONSOLE_IMAGE

# # Prefer podman if installed. Otherwise, fall back to docker.
# if [ -x "$(command -v podman)" ]; then
#     if [ "$(uname -s)" = "Linux" ]; then
#         # Use host networking on Linux since host.containers.internal is unreachable in some environments.
#         BRIDGE_PLUGINS="${PLUGIN_NAME}=http://jkincl-mac:9001"
#         podman run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm --network=host --env-file <(set | grep BRIDGE) $CONSOLE_IMAGE
#     else
#         BRIDGE_PLUGINS="${PLUGIN_NAME}=http://host.containers.internal:9001"
#         podman run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm -p "$CONSOLE_PORT":9000 --env-file <(set | grep BRIDGE) $CONSOLE_IMAGE
#     fi
# else
#     BRIDGE_PLUGINS="${PLUGIN_NAME}=http://host.docker.internal:9001"
#     docker run --pull always --platform $CONSOLE_IMAGE_PLATFORM --rm -p "$CONSOLE_PORT":9000 --env-file <(set | grep BRIDGE) $CONSOLE_IMAGE
# fi
