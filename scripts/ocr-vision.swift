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
  if let error {
    let payload: [String: Any] = ["status": "error", "error": error.localizedDescription]
    if let data = try? JSONSerialization.data(withJSONObject: payload), let output = String(data: data, encoding: .utf8) { print(output) }
    exit(3)
  }
  let lines: [[String: Any]] = (request.results as? [VNRecognizedTextObservation] ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return [
      "text": candidate.string,
      "confidence": candidate.confidence,
      "bounding_box": [box.origin.x, box.origin.y, box.size.width, box.size.height],
    ]
  }
  let payload: [String: Any] = ["status": "ok", "lines": lines]
  if let data = try? JSONSerialization.data(withJSONObject: payload), let output = String(data: data, encoding: .utf8) { print(output) }
  exit(0)
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
try! VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
RunLoop.main.run()
