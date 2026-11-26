import AppKit
import ImageIO
import UniformTypeIdentifiers

private let space = CGColorSpace(name: CGColorSpace.sRGB)!

private func ink(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: alpha)
}

private func rounded(_ rect: CGRect, _ radius: CGFloat) -> CGPath {
    CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

private func gradient(_ context: CGContext, _ colors: [CGColor], from: CGPoint, to: CGPoint) {
    if let gradient = CGGradient(colorsSpace: space, colors: colors as CFArray, locations: nil) {
        context.drawLinearGradient(gradient, start: from, end: to,
                                   options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }
}

private func drawIcon(size: Int) -> CGImage {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let scale = CGFloat(size) / 1024
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: scale, y: -scale)
    let tile = rounded(CGRect(x: 89, y: 77, width: 846, height: 846), 199)

    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -14 * scale), blur: 32 * scale, color: ink(0x06101d, 0.43))
    context.addPath(tile)
    context.setFillColor(ink(0x162e43, 0.82))
    context.fillPath()
    context.restoreGState()

    context.saveGState()
    context.addPath(tile)
    context.clip()
    gradient(context, [ink(0xb2d8eb, 0.54), ink(0x50738c, 0.49), ink(0x102940, 0.70)],
             from: CGPoint(x: 105, y: 80), to: CGPoint(x: 852, y: 910))
    if let glow = CGGradient(colorsSpace: space, colors: [ink(0x61e5ee, 0.52), ink(0x61e5ee, 0)] as CFArray, locations: nil) {
        context.drawRadialGradient(glow, startCenter: CGPoint(x: 920, y: 835), startRadius: 0,
                                   endCenter: CGPoint(x: 920, y: 835), endRadius: 620, options: [])
    }
    let bevel = rounded(CGRect(x: 98, y: 86, width: 828, height: 828), 192)
    context.addPath(bevel)
    context.setLineWidth(8)
    context.replacePathWithStrokedPath()
    context.clip()
    gradient(context, [ink(0xeeffff, 0.80), ink(0xdeeeff, 0.13), ink(0x9af0ff, 0.53)],
             from: CGPoint(x: 512, y: 85), to: CGPoint(x: 512, y: 910))
    context.restoreGState()

    let card = rounded(CGRect(x: 280, y: 268, width: 464, height: 458), 110)
    context.addPath(card)
    context.setFillColor(ink(0xd7eeff, 0.10))
    context.fillPath()
    context.addPath(card)
    context.setStrokeColor(ink(0xd7eeff, 0.60))
    context.setLineWidth(14)
    context.strokePath()

    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.setStrokeColor(ink(0xf4feff))
    context.setLineWidth(52)
    context.move(to: CGPoint(x: 386, y: 506))
    context.addLine(to: CGPoint(x: 475, y: 594))
    context.addLine(to: CGPoint(x: 639, y: 423))
    context.strokePath()
    return context.makeImage()!
}

@main
enum TrackerIcon {
    static func main() throws {
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        for size in [16, 32, 128, 256, 512] {
            for scale in [1, 2] {
                let suffix = scale == 2 ? "@2x" : ""
                let path = directory.appendingPathComponent("icon_\(size)x\(size)\(suffix).png")
                guard let file = CGImageDestinationCreateWithURL(path as CFURL, UTType.png.identifier as CFString, 1, nil)
                else { throw CocoaError(.fileWriteUnknown) }
                CGImageDestinationAddImage(file, drawIcon(size: size * scale), nil)
                guard CGImageDestinationFinalize(file) else { throw CocoaError(.fileWriteUnknown) }
            }
        }
    }
}
