SELECT
    "syncDeviceState" as rule,
    state.desired as state,
    version,
    timestamp,
    topic(3) as thingId,
    topic(6) as endpointId
FROM
    '$aws/things/+/shadow/name/+/update/accepted'
WHERE
    ( 
        CASE isUndefined(state.desired.source) 
            WHEN true THEN false
            ELSE state.desired.source = "alexa"
        END
    ) = true