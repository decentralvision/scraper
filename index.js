
const puppeteer = require('puppeteer-extra')
const {executablePath} = require('puppeteer')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const userAgent = require('user-agents');
const { convertArrayToCSV } = require('convert-array-to-csv');
const fs = require('fs')
const {FingerprintInjector} = require('fingerprint-injector')
const {FingerprintGenerator} = require('fingerprint-generator')

// const useProxy = require('puppeteer-page-proxy')
// const proxyRouter = require('@extra/proxy-router')
// const axios = require('axios')
const state = 'tx'
numOfPages = 25;
// const proxy = 'https://TRCAUJDA3JWYVW1F4LE0IS9AAQAPIEL0A9CT0CFAVPIBHDOQALATA7BDGWTSJ3WHS1F2EO6SU6EWM7PI:render_js=false@proxy.scrapingbee.com:8887'
// relevant variables to change to adjust results
puppeteer.use(StealthPlugin())
const fingerprintGenerator = new FingerprintGenerator();
const browserFingerprintWithHeaders = fingerprintGenerator.getFingerprint({
  devices: ['mobile'],
  browsers: ['chrome'],
})
const fingerprintInjector = new FingerprintInjector();

// puppeteer.use(
//   proxyRouter({
//     proxies: { DEFAULT: 'http://TRCAUJDA3JWYVW1F4LE0IS9AAQAPIEL0A9CT0CFAVPIBHDOQALATA7BDGWTSJ3WHS1F2EO6SU6EWM7PI:render_js=false@proxy.scrapingbee.com:8886' },
//   })
// )

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

const checkForCaptcha = async (page) => {
  try {
    await page.waitForTimeout(2000)
    await page.$eval('#px-captcha', el =>{
      return el
    })
    captchaPresent = true
  } catch {
    captchaPresent = false
  }
  return captchaPresent
}

const bypassCaptcha = async (page, url) => {
  console.log(await checkForCaptcha(page))
  let captchaPresent = await checkForCaptcha(page)
    while (captchaPresent == true) {
      // await page.setUserAgent(userAgent.toString())
      await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
      await page.goto(url)
      const xOffset = getRandomArbitrary(25,150)
      const yOffset = getRandomArbitrary(10, 75)
      console.log('captcha detected')
      try {
        const rect = await page.$eval('#px-captcha', el => {
          const {x, y} = el.getBoundingClientRect();
          return {x, y};
          });
        const offset = {x: xOffset, y: yOffset};
        await page.waitForTimeout(2000)
        await page.mouse.click(rect.x + offset.x, rect.y + offset.y, {
          delay: 10000
          });
        await page.waitForTimeout(5000)
        captchaPresent = true
      } catch { console.log('captcha solved'); captchaPresent=false}
  }
}

const getCities = async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: executablePath() })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080 })
  
  await page.goto(`https://www.biggestuscities.com/${state}`)
  // await page.waitForTimeout(2000)
  await page.waitForSelector('.big')
  const citiesList = await page.$$eval('.big', node => node.map(el => el.innerText))
  await browser.close()
  return citiesList
}

const scrapeCities = async (cities) => {
  let stateAgents = []
  for(i=0;i<cities.length;i++){
    const cityAgents = await scrapeCity(cities[i])
    console.log(`${cityAgents.length}-cityAgents`)
    stateAgents = stateAgents.concat(cityAgents)
    console.log(`${stateAgents.concat(cityAgents)}-concatResults`)
  }
  console.log(`${stateAgents.length}-stateAgents`)
  return stateAgents
}

const scrapeCity = async (city) => {
  const specialties = ['BuyersAgent', 'ListingAgent', 'Foreclosure', 'Relocation', 'ShortSale', 'Consulting', 'Other']
  // const wsChromeEndpointurl = 'wss://chrome.browserless.io?token=6630a6b0-a5c6-4939-b87e-3d7cd11ed955'
  // const browser = await puppeteer.connect({browserWSEndpoint: wsChromeEndpointurl})
  const browser = await puppeteer.launch({ headless: false, executablePath: executablePath()})
  // const browser = await browserTemplate.createIncognitoBrowserContext();
  const page = await browser.newPage()
  await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
  const url = `https://www.zillow.com/professionals/listing-agent--real-estate-agent-reviews/${city}-${state}`
  // await useProxy(page, proxy);
  await page.goto(url)
  await bypassCaptcha(page, url)
  // cycle through specialties
  const cityAgents = []
  for(s=0;s<specialties.length;s++){
    // cycle through the available 25 pages
    for(i=1;i<numOfPages+1;i++){
      const api_url = `https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=${i}&locationText=${city}%20${state}&language=English&specialty=${specialties[s]}`
      console.log('attempting to navigate to url')
      // await new Promise(r => setTimeout(r, 2000));
      // await fetch(api_url)
      // .then(response => response.json())
      // .then(json => console.log(json.results))
      // using puppeteer
      // await useProxy(page, proxy);
      await page.goto(api_url)
      await bypassCaptcha(page, api_url)
      console.log('scraping page')
      await page.waitForSelector('pre')
      const pageContent = await page.$eval('pre', node => JSON.parse(node.innerText));
      const professionals = pageContent.results.professionals
      professionals.forEach(professional => {const formattedProfessional = [professional.fullName, professional.businessName, professional.location, professional.phoneNumber, specialties[s]]; cityAgents.push(formattedProfessional)}) 
      console.log(cityAgents)
    }
  }
  return cityAgents
}

const scrape = async () => {
  const cities = await getCities();
  console.log(`scraping cities:${cities}`);
  const citiesSlice = cities.slice(1,2)
  console.log(citiesSlice[0])
  const stateAgents = await scrapeCities(citiesSlice);
  const header = ['name', 'group', 'region', 'phone', 'agent type']
  const val = convertArrayToCSV(stateAgents, {
    header,
    separator: ','
    });
    console.log(val)
    fs.writeFile(`agents${citiesSlice[0]}.csv`, val, (err) => {
          if (err) throw err;
          console.log('The file has been saved!');
        });  
}

scrape()


// fetch('https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=4&locationText=Sacramento CA&language=English&specialty=Foreclosure')
//   .then(response => response.json())
//   .then(json => console.log(json.results))

