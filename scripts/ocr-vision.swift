import Foundation
import Vision
import ImageIO
import CoreGraphics

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path) as CFURL
guard let source = CGImageSourceCreateWithURL(url, nil),
      let original = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(2) }

let width = original.width
let height = original.height
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: nil, width: width, height: height, bitsPerComponent: 8,
  bytesPerRow: width * 4, space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else { exit(2) }
context.draw(original, in: CGRect(x: 0, y: 0, width: width, height: height))
guard let image = context.makeImage() else { exit(2) }

let request = VNRecognizeTextRequest { request, error in
  if let error { fputs("ERR \(error)\n", stderr); exit(3) }
  for observation in (request.results as? [VNRecognizedTextObservation] ?? []) {
    if let candidate = observation.topCandidates(1).first { print(candidate.string) }
  }
  exit(0)
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
try! VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
RunLoop.main.run()
