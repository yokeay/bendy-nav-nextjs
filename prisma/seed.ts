import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_ENGINES = [
  { code: "bing", name: "Bing", url: "https://www.bing.com/search?q=%s", sort: 10, isDefault: true },
  { code: "google", name: "Google", url: "https://www.google.com/search?q=%s", sort: 20 },
  { code: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", sort: 30 },
  { code: "baidu", name: "百度", url: "https://www.baidu.com/s?wd=%s", sort: 40 }
];

async function main() {
  for (const engine of DEFAULT_ENGINES) {
    await prisma.searchEngine.upsert({
      where: { code: engine.code },
      update: { name: engine.name, url: engine.url, sort: engine.sort, isDefault: engine.isDefault ?? false },
      create: { ...engine }
    });
  }

  await prisma.systemConfig.upsert({
    where: { key: "site" },
    update: {},
    create: {
      key: "site",
      value: {
        title: "笨迪导航",
        description: "基于 Next.js 的笨迪导航",
        icp: null,
        logo: null,
        maintenance: false
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
