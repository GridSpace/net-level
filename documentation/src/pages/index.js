import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

const features = [
    {
        title: 'Net-enables LevelDB',
        imageUrl: 'img/leveldb_cube.png',
        description: (
            <>
                LevelDB is a blazing fast open-source on-disk key-value store inspired by Google's Bigtable; it
                underlies IndexedDB and several blockchain implementations.
            </>
        )
    },
    {
        title: 'Supports Makers',
        imageUrl: 'img/gridspace_yellow_cube_docs.png',
        description: (
            <>
                Net Level was developed to support the unique server architecture of Kiri:Moto, a browser based slicer
                for 3D printing, CNC Milling and Laser Cutting.
            </>
        )
    },
    {
        title: 'High-Volume Apps',
        imageUrl: 'img/CourtHive.png',
        description: (
            <>
                Net Level powers the server infrastructure behind CourtHive/TMX, an Open Source / Open Data project for
                Tournament Management.
            </>
        )
    }
];

function Feature({ imageUrl, title, description }) {
    const imgUrl = useBaseUrl(imageUrl);
    return (
        <div className={clsx('col col--4', styles.feature)}>
            {imgUrl && (
                <div className="text--center">
                    <img className={styles.featureImage} src={imgUrl} alt={title} />
                </div>
            )}
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    );
}

// <header className={clsx("hero hero--primary", styles.heroBanner)}></header>
export default function Home() {
    const context = useDocusaurusContext();
    const { siteConfig = {} } = context;
    return (
        <Layout title={`${siteConfig.title}`} description="Net-enables LevelDB">
            <header className={clsx(styles.heroBanner)} style={{ backgroundColor: 'lightgray' }}>
                <div className="container" style={{ color: 'black' }}>
                    <h1 className="hero__title">{siteConfig.title}</h1>
                    <p className="hero__subtitle">{siteConfig.tagline}</p>
                    <div className={styles.buttons}>
                        <Link
                            style={{ backgroundColor: 'darkgrey' }}
                            className={clsx('button button--outline button--secondary button--lg', styles.getStarted)}
                            to={useBaseUrl('docs/')}
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </header>
            <main>
                {features?.length > 0 && (
                    <section className={styles.features}>
                        <div className="container">
                            <div className="row">
                                {features.map((props, idx) => (
                                    <Feature key={idx} {...props} />
                                ))}
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </Layout>
    );
}
