// bundle.ts
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

// Load the version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
const version = packageJson.version
const outputDir = path.join(process.cwd(), 'dist')
const outputZip = path.join(process.cwd(), `twitch-extension-${version}.zip`)
const viewerHtml = fs.readFileSync(path.join(outputDir, 'index.html'))

// Initialize the zip file
const zip = new AdmZip()

// Function to add files and folders recursively
function addFilesRecursively(folderPath: string, zipFolderPath = '') {
  fs.readdirSync(folderPath).forEach((file) => {
    if (!zipFolderPath && file === 'index.html') return
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
zip.addFile('mobile.html', viewerHtml)
zip.addFile('panel.html', viewerHtml)

// Write the zip file to disk
zip.writeZip(outputZip)

console.log(`Created ${outputZip} with mobile.html and panel.html.`)
