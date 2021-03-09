SELECT
    "syncAlexaState" as rule,
    state.reported as state,
    version,
    timestamp,
    topic(3) as thingId,
    topic(6) as endpointId
FROM
    '$aws/things/+/shadow/name/+/update/accepted'
WHERE
    ( 
        CASE isUndefined(state.reported.source) 
            WHEN true THEN false
            ELSE state.reported.source = "device"
        END
    ) = true