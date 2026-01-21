# OpenShift Scheduler Console Plugin

An OpenShift Console dynamic plugin that provides real-time visualization of cluster resource utilization and pod scheduling across nodes.

## Overview

This plugin adds a **Cluster Scheduler Overview** page to the OpenShift web console under the **Observe** section. It provides cluster administrators and operators with an intuitive, visual representation of:

- **Node resource utilization** (CPU, memory, and other capacity resources)
- **Pod distribution** across nodes
- **Scheduling pressure** - unscheduled pods and their resource requirements
- **Node health status** and conditions
- **System vs. workload pods** separation

## Features

### Resource Visualization

- **Effective resource calculation**: Shows the maximum of requested and limited resources to represent actual scheduling constraints
- **Multiple resource types**: CPU, memory, pods, ephemeral-storage, and any other node capacity resources
- **Color-coded indicators**: Green (healthy), yellow (warning), and red (critical) utilization levels
- **Pod sizing**: Visual representation of pod resource requirements with proportional sizing

### Flexible Filtering

- **Project/Namespace filtering**: Filter pods by namespace with multi-select search capability
- **Resource selection**: Choose which capacity resources to display (CPU, memory, pods, etc.)
- **Node filtering**: Option to hide nodes without workloads
- **View modes**: Toggle between detailed card view and compact grid view

### Scheduling Insights

- **Scheduling pressure monitoring**: Highlights unscheduled pods with failure reasons
- **Node role grouping**: Organizes nodes by roles (master, worker, etc.) in compact view
- **Pod status indicators**: Visual representation of pod phases (Running, Pending, Failed, etc.)
- **System pod separation**: Distinguishes between user workloads and OpenShift/Kubernetes system pods

### User Experience

- **Real-time updates**: Leverages OpenShift's dynamic plugin SDK to watch for cluster changes
- **Interactive tooltips**: Hover over pods and nodes for detailed information
- **Compact visualization**: Efficient use of screen space with resizable elements
- **Pod name display**: Optional toggle to show pod names on visualization blocks

## Use Cases

- **Capacity planning**: Identify overutilized nodes and available capacity
- **Troubleshooting**: Quickly spot unscheduled pods and resource bottlenecks
- **Resource optimization**: Understand actual vs. requested resource utilization
- **Cluster health monitoring**: Track node conditions and pod distribution

## Requirements

[Node.js](https://nodejs.org/en/) and [yarn](https://yarnpkg.com) are required
to build and run the plugin. To run OpenShift console in a container, either
[Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io) and
[oc](https://console.redhat.com/openshift/downloads) are required.

The plugin uses the `v1` API version of `ConsolePlugin` CRD, requiring OpenShift 4.12 or higher.

## Development

### Option 1: Local

In one terminal window, run:

1. `yarn install`
2. `yarn run start`

In another terminal window, run:

1. `oc login` (requires [oc](https://console.redhat.com/openshift/downloads) and an [OpenShift cluster](https://console.redhat.com/openshift/create))
2. `yarn run start-console` (requires [Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io))

This will run the OpenShift console in a container connected to the cluster
you've logged into. The plugin HTTP server runs on port 9001 with CORS enabled.
Navigate to <http://localhost:9000/example> to see the running plugin.

#### Running start-console with Apple silicon and podman

If you are using podman on a Mac with Apple silicon, `yarn run start-console`
might fail since it runs an amd64 image. You can workaround the problem with
[qemu-user-static](https://github.com/multiarch/qemu-user-static) by running
these commands:

```bash
podman machine ssh
sudo -i
rpm-ostree install qemu-user-static
systemctl reboot
```

### Option 2: Docker + VSCode Remote Container

Make sure the
[Remote Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
extension is installed. This method uses Docker Compose where one container is
the OpenShift console and the second container is the plugin. It requires that
you have access to an existing OpenShift cluster. After the initial build, the
cached containers will help you start developing in seconds.

1. Create a `dev.env` file inside the `.devcontainer` folder with the correct values for your cluster:

```bash
OC_PLUGIN_NAME=console-plugin-template
OC_URL=https://api.example.com:6443
OC_USER=kubeadmin
OC_PASS=<password>
```

2. `(Ctrl+Shift+P) => Remote Containers: Open Folder in Container...`
3. `yarn run start`
4. Navigate to <http://localhost:9000/example>

## Docker image

Before you can deploy your plugin on a cluster, you must build an image and
push it to an image registry.

1. Build the image:

   ```sh
   docker build -t quay.io/my-repository/my-plugin:latest .
   ```

2. Run the image:

   ```sh
   docker run -it --rm -d -p 9001:80 quay.io/my-repository/my-plugin:latest
   ```

3. Push the image:

   ```sh
   docker push quay.io/my-repository/my-plugin:latest
   ```

NOTE: If you have a Mac with Apple silicon, you will need to add the flag
`--platform=linux/amd64` when building the image to target the correct platform
to run in-cluster.

## Deployment on cluster

A [Helm](https://helm.sh) chart is available to deploy the plugin to an OpenShift environment.

The following Helm parameters are required:

`plugin.image`: The location of the image containing the plugin that was previously pushed

Additional parameters can be specified if desired. Consult the chart [values](charts/openshift-console-plugin/values.yaml) file for the full set of supported parameters.

### Installing the Helm Chart

Install the chart using the name of the plugin as the Helm release name into a new namespace or an existing namespace as specified by the `plugin_console-plugin-template` parameter and providing the location of the image within the `plugin.image` parameter by using the following command:

```shell
helm upgrade -i  my-plugin charts/openshift-console-plugin -n my-namespace --create-namespace --set plugin.image=my-plugin-image-location
```

NOTE: When deploying on OpenShift 4.10, it is recommended to add the parameter `--set plugin.securityContext.enabled=false` which will omit configurations related to Pod Security.

NOTE: When defining i18n namespace, adhere `plugin__<name-of-the-plugin>` format. The name of the plugin should be extracted from the `consolePlugin` declaration within the [package.json](package.json) file.

## i18n

The plugin template demonstrates how you can translate messages in with [react-i18next](https://react.i18next.com/). The i18n namespace must match
the name of the `ConsolePlugin` resource with the `plugin__` prefix to avoid
naming conflicts. For example, the plugin template uses the
`plugin__console-plugin-template` namespace. You can use the `useTranslation` hook
with this namespace as follows:

```tsx
conster Header: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-template');
  return <h1>{t('Hello, World!')}</h1>;
};
```

For labels in `console-extensions.json`, you can use the format
`%plugin__console-plugin-template~My Label%`. Console will replace the value with
the message for the current language from the `plugin__console-plugin-template`
namespace. For example:

```json
  {
    "type": "console.navigation/section",
    "properties": {
      "id": "admin-demo-section",
      "perspective": "admin",
      "name": "%plugin__console-plugin-template~Plugin Template%"
    }
  }
```

Running `yarn i18n` updates the JSON files in the `locales` folder of the
plugin template when adding or changing messages.

## Linting

This project adds prettier, eslint, and stylelint. Linting can be run with
`yarn run lint`.

The stylelint config disallows hex colors since these cause problems with dark
mode (starting in OpenShift console 4.11). You should use the
[PatternFly global CSS variables](https://patternfly-react-main.surge.sh/developer-resources/global-css-variables#global-css-variables)
for colors instead.

The stylelint config also disallows naked element selectors like `table` and
`.pf-` or `.co-` prefixed classes. This prevents plugins from accidentally
overwriting default console styles, breaking the layout of existing pages. The
best practice is to prefix your CSS classnames with your plugin name to avoid
conflicts. Please don't disable these rules without understanding how they can
break console styles!

## Reporting

Steps to generate reports

1. In command prompt, navigate to root folder and execute the command `yarn run cypress-merge`
2. Then execute command `yarn run cypress-generate`
The cypress-report.html file is generated and should be in (/integration-tests/screenshots) directory

## References

- [Console Plugin SDK README](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk)
- [Customization Plugin Example](https://github.com/spadgett/console-customization-plugin)
- [Dynamic Plugin Enhancement Proposal](https://github.com/openshift/enhancements/blob/master/enhancements/console/dynamic-plugins.md)
