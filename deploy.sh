#!/bin/bash

BUCKET=$1
VALUE=$2
JSON_FILE=source/constructs/cdk.json

jq --arg nouvelle_valeur "$VALUE" ".context.stage |= \$nouvelle_valeur" "$JSON_FILE" > "$JSON_FILE.tmp" && mv "$JSON_FILE.tmp" "$JSON_FILE"

cd source/constructs
npm run clean:install

overrideWarningsEnabled=false npx cdk bootstrap

overrideWarningsEnabled=false npx cdk deploy --parameters DeployDemoUIParameter=No --parameters AutoWebPParameter=Yes --parameters SourceBucketsParameter=$BUCKET

cd ../..
