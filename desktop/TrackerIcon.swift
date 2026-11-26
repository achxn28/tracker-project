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
    // The artwork fills the canvas, with transparent corners and no outer mat.
    let tile = rounded(CGRect(x: 0, y: 0, width: 1024, height: 1024), 226)
    context.saveGState()
    context.addPath(tile)
    context.clip()
    gradient(context, [ink(0x121b58), ink(0x223db4), ink(0x109adb)],
             from: CGPoint(x: 140, y: 5), to: CGPoint(x: 870, y: 1005))
    if let glow = CGGradient(colorsSpace: space,
        colors: [ink(0x66f4ee, 0.72), ink(0x43d8f0, 0)] as CFArray, locations: nil) {
        context.drawRadialGradient(glow, startCenter: CGPoint(x: 980, y: 990), startRadius: 0,
                                   endCenter: CGPoint(x: 980, y: 990), endRadius: 816, options: [])
    }
    if let highlight = CGGradient(colorsSpace: space,
        colors: [ink(0xa4c6ff, 0.51), ink(0xa4c6ff, 0)] as CFArray, locations: nil) {
        context.drawRadialGradient(highlight, startCenter: CGPoint(x: 490, y: -230), startRadius: 0,
                                   endCenter: CGPoint(x: 490, y: -230), endRadius: 750, options: [])
    }

    context.saveGState()
    context.addPath(rounded(CGRect(x: 4, y: 4, width: 1016, height: 1016), 223))
    context.setLineWidth(7)
    context.replacePathWithStrokedPath()
    context.clip()
    gradient(context, [ink(0xe5f3ff, 0.51), ink(0xa9c5ff, 0.06), ink(0xc6fff8, 0.29)],
             from: CGPoint(x: 512, y: 0), to: CGPoint(x: 512, y: 1024))
    context.restoreGState()

    let check = CGMutablePath()
    check.move(to: CGPoint(x: 268, y: 516))
    check.addLine(to: CGPoint(x: 438, y: 686))
    check.addLine(to: CGPoint(x: 765, y: 330))
    let mark = check.copy(strokingWithWidth: 111, lineCap: .round, lineJoin: .round, miterLimit: 1)
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: -18 * scale), blur: 28 * scale, color: ink(0x132354, 0.39))
    context.addPath(mark)
    context.setFillColor(ink(0xf7fcff))
    context.fillPath()
    context.restoreGState()
    context.addPath(mark)
    context.clip()
    gradient(context, [ink(0xffffff), ink(0xf1fbff), ink(0xc0f2ff)],
             from: CGPoint(x: 490, y: 282), to: CGPoint(x: 490, y: 759))
    context.restoreGState()
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
