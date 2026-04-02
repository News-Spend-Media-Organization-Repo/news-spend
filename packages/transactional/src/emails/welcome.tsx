import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

type WelcomeEmailProps = {
  username: string;
};

export const WelcomeEmail = ({ username = "User" }: WelcomeEmailProps) => (
  <Html>
    <Head />
    <Preview>Welcome to News-Spend Media – Where Dreams Come to Life!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img
            alt="News Spend Logo"
            src="https://newsspend.com/images/email-banner.jpg"
            style={logo}
          />
        </Section>
        {/* <Heading style={h1}>
          Welcome to News-Spend Media – Where Dreams Come to Life!
        </Heading> */}

        <Text style={text}>Dear {username},</Text>

        <Text style={text}>
          I am Segun Obisesan, the Director of Newsspend Media. It's an absolute
          pleasure to welcome you to our growing family. By joining Newsspend
          Media, you've taken the first step on a journey where your dreams can
          truly come to life.
        </Text>

        <Section style={section}>
          <Heading style={h2}>Our Vision</Heading>
          <Text style={text}>
            Newsspend Media was founded with a bold purpose: to make your
            engagement with media not only entertaining but also life-changing.
            Imagine earning points for activities you already love—watching live
            streams, sharing content, shopping, and completing surveys—and using
            those points to achieve what you've always wished for.
          </Text>
          <Text style={text}>
            This is your moment. This is where ordinary actions meet
            extraordinary possibilities.
          </Text>
        </Section>

        <Section style={section}>
          <Heading style={h2}>Your Path to Redefined Possibilities</Heading>
          <Text style={text}>
            Here at Newsspend, every engagement brings you closer to fulfilling
            your dreams. Let us show you how to start your journey:
          </Text>

          <Section
            style={{
              padding: "0 15px",
            }}
          >
            <Text
              style={{
                fontSize: "16px",
                lineHeight: "1.5",
                color: "#333",
                fontWeight: "bold",
              }}
            >
              1. Activate your Dream
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              Log into the App and unlock a world of endless opportunities
              tailored just for you.
            </Text>

            <Text
              style={{
                fontSize: "16px",
                lineHeight: "1.5",
                color: "#333",
                fontWeight: "bold",
              }}
            >
              2. Earn Points Every Day
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              Discover exciting ways to build your dream by engaging with:
            </Text>
            <ul
              style={{
                paddingLeft: "20px",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              <li>Reading news that matters</li>
              <li>Watching and sharing captivating live streams</li>
              <li>Connecting with content that inspires</li>
              <li>Complete surveys</li>
            </ul>

            <Text
              style={{
                fontSize: "16px",
                lineHeight: "1.5",
                color: "#333",
                fontWeight: "bold",
              }}
            >
              3. Make Your Points Count
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              Your points are your currency of dreams. Use them to:
            </Text>
            <ul
              style={{
                paddingLeft: "20px",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              <li>
                <strong>Achieve Your Dream:</strong> Hit your target points, and
                we'll bring your vision to life—your wish made real by Newsspend
                Media.
              </li>
              <li>
                <strong>Play & Win:</strong> Enter our bi-weekly lottery for a
                chance to win incredible prizes like phones, laptops, fridges,
                generators, and even cash.
              </li>
            </ul>

            <Text
              style={{
                fontSize: "16px",
                lineHeight: "1.5",
                color: "#333",
                fontWeight: "bold",
              }}
            >
              4. Bank Your Points
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#333",
              }}
            >
              Consistency is key. Bank your points daily and watch your dreams
              get closer. Keep in mind, your points reset every 12 months, so
              seize every opportunity to engage and grow.
            </Text>
          </Section>
        </Section>

        <Section style={section}>
          <Heading style={h2}>Why This Matters</Heading>
          <Text style={text}>
            Newsspend Media is more than an app; it's a community of dreamers,
            achievers, and go-getters. Here, your time isn't just spent—it's
            invested. Your small daily actions can lead to remarkable
            transformations, proving that greatness is within your reach.
          </Text>
        </Section>

        <Text style={text}>
          If you ever need assistance, our support team is just an email away at{" "}
          <Link href="mailto:support@newsspend.com">support@newsspend.com</Link>
          .
        </Text>

        <Text style={text}>
          Thank you for being part of Newsspend Media. You're not just a user,
          you're part of a movement that celebrates ambition, rewards
          perseverance, and changes lives. Together, we'll turn your dreams into
          reality!
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          &copy; {new Date().getFullYear()} News Spend Media. All rights
          reserved.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default WelcomeEmail;

const main = {
  backgroundColor: "#ffffff",
  fontSize: "5px",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "white",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
};

const logoSection = {
  padding: "20px",
  textAlign: "center" as const,
  borderBottom: "1px solid #e0e0e0",
};

const logo = {
  maxWidth: "250px",
  height: "auto",
  margin: "0 auto",
};

const _h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0",
  textAlign: "center" as const,
};

const h2 = {
  color: "#333",
  fontSize: "20px",
  fontWeight: "bold",
  margin: "18px 0",
  padding: "0",
};

const text = {
  color: "#333",
  fontSize: "14px",
  lineHeight: "26px",
};

const _listItem = {
  ...text,
  marginBottom: "10px",
};

const section = {
  margin: "18px 0",
};

const _signature = {
  ...text,
  fontStyle: "italic",
  marginTop: "32px",
};

const hr = {
  borderColor: "#cccccc",
  margin: "20px 0",
};

const footer = {
  color: "#898989",
  fontSize: "12px",
  marginTop: "24px",
  textAlign: "center" as const,
};
