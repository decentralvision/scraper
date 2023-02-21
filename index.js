
const puppeteer = require('puppeteer-extra')
const {executablePath} = require('puppeteer')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { convertArrayToCSV } = require('convert-array-to-csv');
const fs = require('fs')
const {FingerprintInjector} = require('fingerprint-injector')
const {FingerprintGenerator} = require('fingerprint-generator')

// const useProxy = require('puppeteer-page-proxy')
// const proxyRouter = require('@extra/proxy-router')
// const axios = require('axios')

// the only setting
const state = 'tx'


let cities = []
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

const bypassCaptcha = async (browser, page, url) => {
  console.log(`captcha present? ${await checkForCaptcha(page)}`)
  let captchaPresent = await checkForCaptcha(page)
  let tryNumber = 0
    while (captchaPresent == true) {
      console.log(`try number: ${tryNumber}`)
      if (tryNumber >= 3) {
        console.log(`three tries deep throwing them off the trail ;)`)
        browser.close()
        browser = await puppeteer.launch({ headless: false, executablePath: executablePath()})
        page = await browser.newPage()
      }
      console.log('getting a new browser fingerprint')
      const browserFingerprintWithHeaders = fingerprintGenerator.getFingerprint({
        devices: ['mobile', 'desktop'],
        browsers: ['chrome', 'firefox', 'safari', 'edge'],
      })
      const decoyCityNumber = Math.floor(getRandomArbitrary(0,100))
      console.log('attaching new fingerprint')
      await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
      console.log('visiting random page')
      await page.goto(`https://www.zillow.com/professionals/listing-agent--real-estate-agent-reviews/${cities[decoyCityNumber]}-${state}`)
      await page.waitForTimeout(5000)
      const xOffset = await getRandomArbitrary(25,150)
      const yOffset = await getRandomArbitrary(10, 75)
      console.log('captcha detected')
      try {
        const rect = await page.$eval('#px-captcha', el => {
          const {x, y} = el.getBoundingClientRect();
          return {x, y};
          });
        const offset = {x: xOffset, y: yOffset};
        await page.waitForTimeout(2000)
        await page.mouse.click(rect.x + offset.x, rect.y + offset.y, {
          delay: 12000
          });
        await page.waitForTimeout(5000)
        captchaPresent = true
      } catch { console.log('captcha solved'); captchaPresent=false}
      tryNumber++
      await page.goto(url)
  }
}

const getCities = async () => {
  const browser = await puppeteer.launch({ headless: false, executablePath: executablePath() })
  const page = await browser.newPage()

  await page.goto(`https://www.biggestuscities.com/${state}`)
  // await page.waitForTimeout(2000)
  await page.waitForSelector('.big')
  const citiesList = await page.$$eval('.big', node => node.map(el => el.innerText))
  await browser.close()
  cities = citiesList
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
  const page = await browser.newPage()
  await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
  const url = `https://www.zillow.com/professionals/listing-agent--real-estate-agent-reviews/${city}-${state}`
  await page.goto(url)
  await bypassCaptcha(browser, page, url)
  // cycle through specialties
  const cityAgents = []
  for(s=0;s<specialties.length;s++){
    // cycle through the available 25 pages
    for(i=1;i<numOfPages+1;i++){
      const api_url = `https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=${i}&locationText=${city}%20${state}&language=English&specialty=${specialties[s]}`
      await page.goto(api_url)
      await bypassCaptcha(browser, page, api_url)
      console.log('scraping page')
      await page.waitForSelector('pre')
      const pageContent = await page.$eval('pre', node => JSON.parse(node.innerText));
      const professionals = pageContent.results.professionals
      professionals.forEach(professional => {const formattedProfessional = [professional.fullName, professional.businessName, professional.location, professional.phoneNumber, specialties[s]]; cityAgents.push(formattedProfessional)}) 
      console.log(`agents collected: ${cityAgents.length}`)
    }
  }
  return cityAgents
}

const scrape = async () => {
  await getCities();
  const citiesSlice = cities.slice(0,1)
  console.log(citiesSlice[0])
  const stateAgents = await scrapeCities(citiesSlice);
  const header = ['name', 'group', 'region', 'phone', 'agent type']
  const val = convertArrayToCSV(stateAgents, {
    header,
    separator: ','
    });
    console.log(val)
    fs.writeFile(`Zillow.com - ${citiesSlice[0]} - agents.csv`, val, (err) => {
          if (err) throw err;
          console.log('The file has been saved!');
        });  
}

scrape()


// fetch('https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=4&locationText=Sacramento CA&language=English&specialty=Foreclosure')
//   .then(response => response.json())
//   .then(json => console.log(json.results))

