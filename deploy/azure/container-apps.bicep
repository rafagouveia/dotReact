@description('Azure Container Apps environment name.')
param environmentName string

@description('Container App name.')
param appName string

@description('Immutable OCI image reference. Prefer registry/repository@sha256:digest.')
param containerImage string

@description('Container registry authentication mode. Azure Container Registry images require acrManagedIdentity.')
@allowed([
  'public'
  'acrManagedIdentity'
])
param registryAccess string = 'public'

@description('Resource ID of a pre-existing user-assigned identity with AcrPull on the registry.')
param acrPullIdentityResourceId string = ''

param location string = resourceGroup().location

@minValue(1)
param minReplicas int = 1

@minValue(1)
param maxReplicas int = 1

@description('Traffic percentage assigned to the newest revision. Values below 100 require stableRevisionName.')
@minValue(0)
@maxValue(100)
param latestRevisionWeight int = 100

@description('Existing healthy revision receiving the remaining traffic during canary or rollback.')
param stableRevisionName string = ''

var registryServer = first(split(containerImage, '/'))
var imageUsesAcr = endsWith(toLower(registryServer), '.azurecr.io')
var useAcrIdentity = registryAccess == 'acrManagedIdentity'
var configurationIsValid = maxReplicas >= minReplicas && (latestRevisionWeight == 100 || !empty(stableRevisionName)) && (useAcrIdentity ? !empty(acrPullIdentityResourceId) : empty(acrPullIdentityResourceId) && !imageUsesAcr)
var revisionTraffic = latestRevisionWeight == 100 ? [
  {
    latestRevision: true
    weight: 100
  }
] : latestRevisionWeight == 0 ? [
  {
    revisionName: stableRevisionName
    weight: 100
  }
] : [
  {
    latestRevision: true
    weight: latestRevisionWeight
  }
  {
    revisionName: stableRevisionName
    weight: 100 - latestRevisionWeight
  }
]

// A nested ARM deployment defers this cross-parameter guard to deployment
// validation because stable Bicep does not yet support assert declarations.
#disable-next-line no-deployments-resources
resource configurationValidation 'Microsoft.Resources/deployments@2022-09-01' = {
  name: '${appName}-configuration-validation'
  properties: {
    mode: 'Incremental'
    expressionEvaluationOptions: {
      scope: 'inner'
    }
    parameters: {
      validationState: {
        value: configurationIsValid ? 'valid' : 'invalid-registry-identity-replica-or-traffic-configuration'
      }
    }
    template: {
      '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#'
      contentVersion: '1.0.0.0'
      parameters: {
        validationState: {
          type: 'string'
          allowedValues: [
            'valid'
          ]
        }
      }
      resources: []
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {}
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: useAcrIdentity ? {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityResourceId}': {}
    }
  } : {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      registries: useAcrIdentity ? [
        {
          server: registryServer
          identity: acrPullIdentityResourceId
        }
      ] : []
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8080
        transport: 'auto'
        traffic: revisionTraffic
      }
    }
    template: {
      containers: [
        {
          name: 'dotreact'
          image: containerImage
          env: [
            {
              name: 'ASPNETCORE_HTTP_PORTS'
              value: '8080'
            }
            {
              name: 'ASPNETCORE_ENVIRONMENT'
              value: 'Production'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/_health/ready'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 1
              periodSeconds: 2
              timeoutSeconds: 2
              failureThreshold: 30
              successThreshold: 1
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/_health/ready'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 1
              periodSeconds: 5
              timeoutSeconds: 2
              failureThreshold: 3
              successThreshold: 1
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/_health/live'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              timeoutSeconds: 2
              failureThreshold: 3
              successThreshold: 1
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    configurationValidation
  ]
}

output containerAppId string = app.id
output fqdn string = app.properties.configuration.ingress.fqdn
output principalId string = app.identity.principalId
output latestRevisionName string = app.properties.latestRevisionName
