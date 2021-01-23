const fs = require('fs')
const path = require('path')

function* getFiles(searchDirectory) {
  const dirents = fs.readdirSync(
    searchDirectory,
    {
      withFileTypes: true
    }
  )

  for (const dirent of dirents) {
    const res = path.resolve(searchDirectory, dirent.name)
    if (dirent.isDirectory()) {
      yield* getFiles(res)
    } else {
      yield res;
    }
  }
}

const searchFile = (directory, regex) => {
  const files = []
  for (const f of getFiles(directory)) {
    f.match(regex) && files.push(f)
  }
  return files
}

module.exports = {
  searchFile
}