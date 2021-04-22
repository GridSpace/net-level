/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: "Net Level",
  tagline: "Distributed LevelDB Framework",
  url: "https://grid.space",
  baseUrl: "/net-level/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",
  organizationName: "gridspace", // Usually your GitHub org/user name.
  projectName: "net-level", // Usually your repo name.
  themeConfig: {
    navbar: {
      title: "Net Level",
      logo: {
        alt: "grid.space",
        src: "img/gridspace_yellow_cube_docs.png",
      },
      items: [
        {
          to: "docs/",
          activeBasePath: "docs",
          label: "Docs",
          position: "left",
        },
        // { to: "blog", label: "Blog", position: "left" },
        {
          href: "https://github.com/gridspace",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        // {
        //   title: "Docs",
        //   items: [
        //     {
        //       label: "Getting Started",
        //       to: "docs/",
        //     },
        //   ],
        // },
        // {
        //   title: "Community",
        //   items: [
        //     {
        //       label: "Stack Overflow",
        //       href: "",
        //     },
        //     {
        //       label: "Discord",
        //       href: "",
        //     },
        //     {
        //       label: "Twitter",
        //       href: "",
        //     },
        //   ],
        // },
        // {
        //   title: "More",
        //   items: [
        //     {
        //       label: "Blog",
        //       to: "blog",
        //     },
        //     {
        //       label: "GitHub",
        //       href: "https://github.com/gridspace",
        //     },
        //   ],
        // },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Grid.Space`,
    },
  },
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
        },
        // blog: {
        //   showReadingTime: true,
        // },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
};
