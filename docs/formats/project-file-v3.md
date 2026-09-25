# Project file V3

`.lightshow` V3 is the current human-readable Project format. It retains all V2 fields and adds optional `protocolOutputId` to an output channel:

```json
{
  "id": "channel-left-arm",
  "displayName": "Left arm",
  "type": "el-wire",
  "hardwareOutputIdentifier": "GP10",
  "protocolOutputId": 0
}
```

The mapping is separate from the opaque hardware identifier. When present it is an integer from 0 through 255 and is unique among channels of the same slave. Equal IDs on different slaves are valid.

V2 readers omitted this field. Current readers migrate V2 in memory with the field unset and never infer it from a GPIO-like string. Open does not rewrite the source; the next Save writes V3. V1 continues through the existing provisional-score migration and is likewise saved as V3 only on an explicit Save.
