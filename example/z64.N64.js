var Parser = require("../lib/binary_parser.js").Parser;

var n64Header = new Parser()
    .uint8("PI_BSB_DOM1_LAT_REG", { assertWithoutErroring: 0x80 })
    .uint8("PI_BSB_DOM1_PGS_REG1", { assertWithoutErroring: 0x37 })
    .uint8("PI_BSB_DOM1_PWD_REG", { assertWithoutErroring: 0x12 })
    .uint8("PI_BSB_DOM1_PGS_REG", { assertWithoutErroring: 0x40 })
    .uint32("ClockRate", { assertWithoutErroring: 0x0F })
    .uint32("Program_Counter_PC")
    .uint32("Release") // 1446 for marioKart, 1444 for NC+MortalKombat, 1447 for GE
    .uint32("CRC1")
    .uint32("CRC2")
    .uint32("Unknown1")
    .uint32("Unknown2")
    .string("ImageName", { length: 20 })
    .uint16("Unknown5")
    .uint16("Unknown6")
    .string("ManufacturerID", { length: 4 })
    .string("CartridgeID", { length: 2 })
    .string("CountryCode", { length: 2 })
    .uint8("Version")
    .array("bootCode", {
        type: "uint8",
        length: 4032
    });

require("fs").readFile("hello.z64", function(err, data) {
    console.log(n64Header.parse(data));
});