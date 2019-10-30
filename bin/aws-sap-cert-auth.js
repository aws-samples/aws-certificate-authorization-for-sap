#!/usr/bin/env node
const cdk = require('@aws-cdk/core');
const { AwsSapCertAuthStack } = require('../lib/aws-sap-cert-auth-stack');
const AppConfig = require('../lib/appConfig.json') 

const app = new cdk.App();
const awscertauthstack = new AwsSapCertAuthStack(app, AppConfig.stackName, { env: AppConfig.env });
