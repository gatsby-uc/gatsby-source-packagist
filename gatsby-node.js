const packagist = require('packagist-api-client')
const axios = require('axios')

exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }) => {
  const { packageNames } = await packagist.getAll()

  for (packagePath of packageNames) {
    const { package } = await packagist.getPackageDetails(packagePath)
    const contents = { mediaType: 'text/markdown', content: '' }

    const masterVersion = package.versions['dev-master'].source

    const { url: masterUrl, reference: commitHash } = masterVersion
    if (masterUrl.includes("github.com")) {

      const url = new URL(masterUrl)

      const packagePath = url.pathname.substring(1, url.pathname.lastIndexOf('.'))

      const { data } = await axios.get(`https://raw.githubusercontent.com/${packagePath}/${commitHash}/README.md`)

      contents.content = data

    }

    actions.createNode({
      ...package,
      id: createNodeId(package.name), // required by Gatsby
      parent: null,
      children: [],
      internal: {
        type: 'packagistPackage', // required by Gatsby
        contentDigest: createContentDigest(contents.content),// required by Gatsby, must be unique
        ...contents
      }
    })
  }
  // This is where we actually create the data node, by passing in the newNode object.
};