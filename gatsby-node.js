const packagist = require('packagist-api-client');
const axios = require('axios');
const mime = require('mime-types');

async function getAllSearchResults(fetchResults, allResults = []) {
  const { results: pageResults, total, next } = await fetchResults();

  allResults.push(pageResults);

  if (!next) {
    const results = allResults.flat();
    return { results, total };
  }

  return getAllSearchResults(next, allResults);
}

// Array order determins order they're attempted to be fetched in...
const README_FILES = ['README.md', 'readme.md', 'Readme.md'];

const README_DOMAINS = {
  'github.com': (path, file) => `https://raw.githubusercontent.com${path}/master/${file}`,
};

async function fetchReadme(urlBuilder, path, reporter, fileNumber = 0) {
  const fileName = README_FILES[fileNumber];
  const url = urlBuilder(path, fileName);

  try {
    console.log(url);
    const { data: file } = await axios.get(url);

    const mimeType = mime.lookup(fileName.substring(fileName.lastIndexOf('.'))) || 'text/plain';

    return { file, mimeType };
  } catch (e) {
    const nextFileNumber = fileNumber + 1;
    if (e.response && e.response.status === 404 && README_FILES[nextFileNumber])
      return fetchReadme(urlBuilder, path, reporter, nextFileNumber);
    else
      reporter.warn(`Unable to find readme for: ${path}.
      It might just be under a slightly different name than we're expecting (PRs are welcome to fix this).`);
  }
}

async function getPackageReadme(package, reporter) {
  const { repository, name } = package;

  const { hostname, pathname } = new URL(repository);

  if (README_DOMAINS.hasOwnProperty(hostname)) {
    reporter.verbose(`Getting readme for package: ${name}`);
    try {
      return await fetchReadme(README_DOMAINS[hostname], pathname, reporter);
    } catch (e) {
      reporter.error('not sure what went wrong', e);
    }
  } else {
    reporter.verbose(
      `Package "${name}" isn't hosted on Github, unable to fetch Readme yet (PRs welcome).`
    );
  }
}

exports.sourceNodes = async (
  { actions, createNodeId, createContentDigest, reporter },
  { query }
) => {
  if (!query || !(query.name || query.type || query.tags)) {
    reporter.error('No query paramaters passed to packagist api', query);
  } else {
    try {
      const { results: packages, total } = await getAllSearchResults(async () =>
        packagist.search(query)
      );
      reporter.info(`Sourcing results for ${total} Packagist packages!`);

      for (package of packages) {
        const { file: readme, mimeType } = (await getPackageReadme(package, reporter)) || '';

        actions.createNode({
          ...package,
          readme: readme,
          id: createNodeId(package.name),
          internal: {
            type: 'packagistPackage',
            mediaType: mimeType,
            contentDigest: createContentDigest(readme),
            content: readme,
          },
        });
      }
    } catch (e) {
      if (e.response) {
        reporter.error('Error searching for packages: ', e);
      }
      reporter.panic('unkown error', e);
    }
  }
};
