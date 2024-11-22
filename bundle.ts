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

addFilesRecursively(outputDir)

// Write the zip file to disk
zip.writeZip(outputZip)

console.log(`Created ${outputZip} with contents from ${outputDir}, including all subdirectories.`)
