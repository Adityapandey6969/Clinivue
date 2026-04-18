import Vision
import AppKit
import Foundation

// Check if a path is provided
guard CommandLine.arguments.count > 1 else {
    print("Error: No image path provided.")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)

// Check if file exists
if !FileManager.default.fileExists(atPath: imagePath) {
    print("Error: File not found at \(imagePath)")
    exit(1)
}

// Perform OCR using Apple Vision
let requestHandler = VNImageRequestHandler(url: imageUrl, options: [:])
let request = VNRecognizeTextRequest { (request, error) in
    if let error = error {
        print("OCR Error: \(error.localizedDescription)")
        return
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return
    }
    
    let recognizedStrings = observations.compactMap { observation in
        return observation.topCandidates(1).first?.string
    }
    
    print(recognizedStrings.joined(separator: "\n"))
}

// Set recognition level to accurate (higher quality)
request.recognitionLevel = .accurate

do {
    try requestHandler.perform([request])
} catch {
    print("Vision Error: \(error.localizedDescription)")
    exit(1)
}
