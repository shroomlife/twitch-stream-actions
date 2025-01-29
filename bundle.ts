// bundle.ts
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

// Load the version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
const version = packageJson.version
const outputDir = path.join(process.cwd(), 'dist')
const outputZip = path.join(process.cwd(), `twitch-extension-${version}.zip`)

// Remove any existing zip file to avoid conflicts
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip)
}

// Initialize the zip file
const zip = new AdmZip()

// Function to add files and folders recursively
function addFilesRecursively(folderPath: string, zipFolderPath = '') {
  fs.readdirSync(folderPath).forEach((file) => {
    const filePath = path.join(folderPath, file)
    const zipFilePath = path.join(zipFolderPath, file)

    if (fs.lstatSync(filePath).isDirectory()) {
      // Recursively add subdirectories
      addFilesRecursively(filePath, zipFilePath)
    }
    else {
      zip.addLocalFile(filePath, zipFolderPath)
    }
  })
}

// Add all files and folders from the 'public' directory, excluding root 'index.html'
addFilesRecursively(outputDir)

// Read the content of 'index.html' and add it as 'mobile.html' and 'panel.html' only if it exists
const indexHtmlPath = path.join(outputDir, 'index.html')
if (fs.existsSync(indexHtmlPath)) {
  const indexHtmlContent = fs.readFileSync(indexHtmlPath)

  // Add as mobile.html
  zip.addFile('mobile.html', indexHtmlContent)

  // Add as panel.html
  zip.addFile('panel.html', indexHtmlContent)
}

// Write the zip file to disk
zip.writeZip(outputZip)

console.log(`Created ${outputZip} with contents from ${outputDir}, including all subdirectories including mobile.html and panel.html.`)
