@description('Globally unique Azure App Service name.')
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

@description('Client ID of the same user-assigned AcrPull identity.')
param acrPullIdentityClientId string = ''

param location string = resourceGroup().location

@allowed([
  'S1'
  'P0v3'
  'P1v3'
])
param skuName string = 'S1'

@minValue(1)
param instanceCount int = 1

var registryServer = first(split(containerImage, '/'))
var imageUsesAcr = endsWith(toLower(registryServer), '.azurecr.io')
var useAcrIdentity = registryAccess == 'acrManagedIdentity'
var registryConfigurationIsValid = useAcrIdentity ? !empty(acrPullIdentityResourceId) && !empty(acrPullIdentityClientId) : empty(acrPullIdentityResourceId) && empty(acrPullIdentityClientId) && !imageUsesAcr

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
        value: registryConfigurationIsValid ? 'valid' : 'invalid-registry-or-identity-configuration'
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

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: skuName
    capacity: instanceCount
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux,container'
  identity: useAcrIdentity ? {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentityResourceId}': {}
    }
  } : {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'DOCKER|${containerImage}'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      acrUseManagedIdentityCreds: useAcrIdentity
      acrUserManagedIdentityID: useAcrIdentity ? acrPullIdentityClientId : null
      healthCheckPath: '/_health/ready'
      appSettings: [
        {
          name: 'ASPNETCORE_HTTP_PORTS'
          value: '8080'
        }
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: 'Production'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
        {
          name: 'WEBSITE_WARMUP_PATH'
          value: '/_health/ready'
        }
        {
          name: 'WEBSITE_WARMUP_STATUSES'
          value: '200'
        }
        {
          name: 'WEBSITES_CONTAINER_START_TIME_LIMIT'
          value: '300'
        }
        {
          name: 'WEBSITES_CONTAINER_STOP_TIME_LIMIT'
          value: '30'
        }
      ]
    }
  }
  dependsOn: [
    configurationValidation
  ]
}

output appServiceId string = app.id
output defaultHostName string = app.properties.defaultHostName
output principalId string = app.identity.principalId
