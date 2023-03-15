
const puppeteer = require('puppeteer-extra')
const {executablePath} = require('puppeteer')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { convertArrayToCSV } = require('convert-array-to-csv');
const fs = require('fs')
const {FingerprintInjector} = require('fingerprint-injector')
const {FingerprintGenerator} = require('fingerprint-generator')

// const useProxy = require('puppeteer-page-proxy')
// const proxy = 'https://TRCAUJDA3JWYVW1F4LE0IS9AAQAPIEL0A9CT0CFAVPIBHDOQALATA7BDGWTSJ3WHS1F2EO6SU6EWM7PI:render_js=false@proxy.scrapingbee.com:8887'



// SETTINGS ---
const state = 'ca'
const begin_num = 0  
const end_num = 5
const delay = 0
//  --------

let cities = []
numOfPages = 25;

puppeteer.use(StealthPlugin())
const fingerprintGenerator = new FingerprintGenerator();
const browserFingerprintWithHeaders = fingerprintGenerator.getFingerprint({
  devices: ['mobile'],
  browsers: ['chrome'],
})
const fingerprintInjector = new FingerprintInjector();

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

const checkForCaptcha = async (page) => {
  try {
    // await page.waitForTimeout(1000)
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
  // console.log(`captcha present? ${await checkForCaptcha(page)}`)
  let captchaPresent = await checkForCaptcha(page)
  let tryNumber = 0
    while (captchaPresent == true) {
      if (tryNumber >= 3) {
        console.log(`opening a new browser window`)
        const pages = await browser.pages();
        await Promise.all(pages.map((page) => page.close()));
        await browser.close();
        browser = await puppeteer.launch({ headless: false, executablePath: executablePath()})
        page = await browser.newPage()
        tryNumber= 0
      }
      console.log(`try number: ${tryNumber+1}`)
      // console.log('getting a new browser fingerprint')
      const browserFingerprintWithHeaders = fingerprintGenerator.getFingerprint({
        devices: ['mobile', 'desktop'],
        browsers: ['chrome', 'firefox', 'safari', 'edge'],
      })
      const decoyCityNumber = Math.floor(getRandomArbitrary(0,100))
      // console.log('attaching new fingerprint')
      await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
      // console.log('visiting random page')
      try {
      await page.goto(`https://www.zillow.com/professionals/listing-agent--real-estate-agent-reviews/${cities[decoyCityNumber]}-${state}`, {
        waitUntil: 'domcontentloaded',
        // Remove the timeout
        timeout: 10000
      })
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        // Remove the timeout
        timeout: 10000
      })
      } catch (err){
        console.log(`error: ${err}`)
        continue
      }
      const xOffset = await getRandomArbitrary(25,150)
      const yOffset = await getRandomArbitrary(10, 75)
      // console.log('captcha detected')
      await page.waitForTimeout(500)
      try {
        const rect = await page.$eval('#px-captcha', el => {
          const {x, y} = el.getBoundingClientRect();
          return {x, y};
        });
        const offset = {x: xOffset, y: yOffset};
        await page.waitForTimeout(500)
        await page.mouse.click(rect.x + offset.x, rect.y + offset.y, {
          delay: 12000
          });
        await page.waitForTimeout(4000)
      } catch (err) { 
        console.log(`${err}`)
        console.log('captcha solved'); 
        captchaPresent=false
      }
        tryNumber++
      }
  return browser, page
}

const getCities = async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: executablePath() })
  const page = await browser.newPage()

  await page.goto(`https://www.biggestuscities.com/${state}`, {
    waitUntil: 'domcontentloaded',
    // Remove the timeout
    timeout: 10000
  })
  // await page.waitForTimeout(2000)
  await page.waitForSelector('.big')
  const citiesList = await page.$$eval('.big', node => node.map(el => el.innerText))
  await browser.close()
  cities = citiesList
  return citiesList
}

const scrapeCities = async (cities) => {
  let stateAgents = []
  for(h=0;h<cities.length;h++){
    console.log(`scraping ${cities[h]}`)
    const cityAgents = await scrapeCity(cities[h])
    console.log(`${cityAgents.length}-cityAgents`)
    stateAgents.push(...cityAgents)
    // console.log(`${stateAgents.concat(cityAgents)}-concatResults`)
  }
  console.log(`${stateAgents.length}-stateAgents`)
  return stateAgents
}

const scrapeCity = async (city) => {
  const specialties = ['BuyersAgent', 'ListingAgent', 'Foreclosure', 'Relocation', 'ShortSale', 'Consulting', 'Other']
  let browser = await puppeteer.launch({ headless: false, executablePath: executablePath()})
  let page = await browser.newPage()
  await fingerprintInjector.attachFingerprintToPuppeteer(page, browserFingerprintWithHeaders)
  const url = `https://www.zillow.com/professionals/listing-agent--real-estate-agent-reviews/${city}-${state}`
  // await useProxy(page, proxy)
  
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    // Remove the timeout
    timeout: 10000
  })
  browser, page = await bypassCaptcha(browser, page, url)

  // cycle through specialties
  const cityAgents = []
  for(s=0;s<specialties.length;s++){
    // cycle through the available 25 pages
    for(i=1;i<numOfPages+1;i++){
      const api_url = `https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=${i}&locationText=${city}%20${state}&language=English&specialty=${specialties[s]}`
      try {
      await page.goto(api_url, {
        waitUntil: 'domcontentloaded',
        // Remove the timeout
        timeout: 10000
      })}
      catch {
        console.log(`error: ${err}`)
        const pages = await browser.pages();
        await Promise.all(pages.map((page) => page.close()));
        await browser.close();
        i-=1; continue;
      }
      await page.waitForTimeout(delay)
      // console.log('scraping page')
      browser, page = await bypassCaptcha(browser, page, api_url)

      try {
      await page.waitForSelector('pre', {
        waitUntil: 'domcontentloaded',
        // Remove the timeout
        timeout: 10000
      })
    } catch (err) {
      console.log(`error: ${err}`)
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));
      await browser.close();
      i-=1; continue;
    }
      const pageContent = await page.$eval('pre', node => JSON.parse(node.innerText));
      const professionals = pageContent.results.professionals
      professionals.forEach(professional => {const formattedProfessional = [professional.fullName, professional.businessName, professional.location, professional.phoneNumber, specialties[s]]; cityAgents.push(formattedProfessional)}) 
      console.log(`agents collected: ${cityAgents.length}`)
    }
  }
  await page.close()
  await browser.close()
  return cityAgents
}

const scrape = async () => {
  await getCities();
  const citiesSlice = cities.slice(begin_num, end_num)
  console.log(citiesSlice)
  const stateAgents = await scrapeCities(citiesSlice);
  // console.log(`${stateAgents}`)
  const header = ['name', 'group', 'region', 'phone', 'agent type']
  const val = convertArrayToCSV(stateAgents, {
    header,
    separator: ','
    });
    // console.log(val)
    fs.writeFile(`Zillow.com - ${citiesSlice.toString()} - agents.csv`, val, (err) => {
          if (err) throw err;
          console.log('The file has been saved!');
        });  
}

scrape()

// 5,10
// fetch('https://www.zillow.com/professionals/api/v2/search/?profileType=2&page=4&locationText=Sacramento CA&language=English&specialty=Foreclosure')
//   .then(response => response.json())
//   .then(json => console.log(json.results))

