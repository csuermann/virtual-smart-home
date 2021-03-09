# Virtual-Smart-Home - Backend

This repository contains the source code of the virtual-smart-home backend. It is published for users to inspect what happens behind the scenes. Note that the repository is not yet in a shape that allows you to
run your own backend easily.

## Lambda Endpoints

North America: arn:aws:lambda:us-east-1:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL
Europe / India: arn:aws:lambda:eu-west-1:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL
Far East: arn:aws:lambda:us-west-2:146271617960:function:virtual-smart-home-dev-skill:LIVE-VSH-SKILL

## Conventions

- ThingIds: vsht-xxx
- Devices: vshd-xxx

## Kill Switch / Service Operations

VSH things subscribe to special topics for service operations which can be used to force-disconnect misbehaving things.

### v1
topic: vsh/vsht-d1dc6353-8fd8-4d67-8668-d9ef9d6d01b5/kill
topic: vsh/version/1.0.0/kill
message: {"reason":"KILLED"}

### v2
topic: vsh/service
topic: vsh/version/2.0.0/service
topic: vsh/vsht-d1dc6353-8fd8-4d67-8668-d9ef9d6d01b5/service
kill message: {"operation":"kill","reason":"KILLED"}
ping message: {"operation":"ping"}

Subscribe to pong messages sent from devices:
vsh/+/pong


## Versions

https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html

aws lambda update-alias --function-name virtual-smart-home-dev-skill --function-version 24 --name LIVE-VSH-SKILL --region eu-west-1
aws lambda update-alias --function-name virtual-smart-home-dev-skill --function-version \$LATEST --name LIVE-VSH-SKILL --region eu-west-1

## Shadow

{
  "reported": {
    "connected": true,
    "vsh_version": "1.10.0",
    "nr_version": "1.2.2",
    "devices": {
      "vshd-xxx": {
        "template": "COLOR_CHANGING_LIGHT_BULB",
        "friendlyName": "Flur Licht"
      },
      "vshd-yyy": {
        "template": "SWITCH",
        "friendlyName": "Heizung"
      },
    }
  }
}