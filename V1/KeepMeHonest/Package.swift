// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KeepMeHonest",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "KeepMeHonest",
            path: "Sources",
            resources: [
                .copy("Resources"),
            ]
        ),
    ]
)
