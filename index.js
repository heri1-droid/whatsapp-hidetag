import ora from "ora";
import chalk from "chalk";
import clear from "console-clear";
import figlet from "figlet";
import qrcode from "qrcode-terminal";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs-extra";

const logger = pino({
  level: "silent",
});

const spinner = ora("Starting...").start();

const showBanner = () => {
  clear();

  const program_name = "Hidetag Whatsapp";

  const author =
    chalk.yellow("\nSource: ") +
    chalk.underline.greenBright("https://t.me/Hackability\n");

  const howToUseEn =
    chalk.magenta.bold("How to use:\n") +
    chalk.blueBright(
      `Once the QR code is scanned and connected to your WhatsApp account, you can send any text message.
To trigger the hidetag, send a message to a group.\n`
    );

  const howToUseId =
    chalk.magenta.bold("Cara pakai:\n") +
    chalk.blueBright(
      `Setelah kode QR di-scan dan telah terhubung ke akun whatsapp kamu, kamu bisa mengirim pesan text apapun.
Untuk mentrigger hidetag, kirim pesan ke sebuah grup.\n`
    );

  const banner = chalk.magentaBright(figlet.textSync(program_name));

  console.log(banner);

  console.log(author);

  console.log(howToUseEn);

  console.log(howToUseId);

  console.log("\n\n");
};

const whatsapp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(".auth_sessions");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ["Ihsan Devs", "Chrome", "20.0.04"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      showBanner();
      spinner.stop();
      chalk.magentaBright(
        qrcode.generate(qr, {
          small: true,
        })
      );

      spinner.start("Please scan the QR Code...");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      const loggedOut =
        lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut;

      const requiredRestart =
        lastDisconnect.error?.output?.statusCode ===
        DisconnectReason.restartRequired;
      spinner
        .warn(
          "connection closed due to ",
          lastDisconnect.error,
          ", reconnecting ",
          shouldReconnect
        )
        .start();

      if (loggedOut) {
        fs.emptyDirSync(".auth_sessions");
        showBanner();
        whatsapp();
        return;
      }

      // reconnect if not logged out
      if (shouldReconnect || requiredRestart) {
        showBanner();
        spinner.start("reconnecting...");
        whatsapp();
      }
    } else if (connection === "open") {
      spinner.succeed("opened connection").start("Waiting new message...");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (messages) => {
    if (
      messages.messages[0].key.fromMe &&
      messages.messages[0].key.remoteJid.includes("@g.us")
    ) {
      const message = messages.messages[0];

      const groupJid = message.key.remoteJid;

      const group = await sock.groupMetadata(groupJid);

      const groupParticipants = group.participants;

      const groupName = group.subject;

      // Jika ada pesan teks
      if (
        message.message.extendedTextMessage?.text ||
        message.message.conversation
      ) {
        let textMessage =
          message.message.extendedTextMessage?.text ||
          message.message.conversation;

        try {
          spinner
            .info(
              `New hidetag message requested into group: ${chalk.underline.bold.yellowBright(
                groupName
              )} (${groupParticipants.length} participants)\nHidetag message: ${textMessage}\n\n`
            )
            .start();

          sock.sendMessage(groupJid, {
            text: textMessage,
            edit: message.key,
            mentions: groupParticipants.map((item) => item.id),
          });
        } catch (error) {
          spinner
            .fail(
              `Failed to send message using hidetag. Error: ${error.toString()}`
            )
            .start();
        }
      }

      // Jika ada pesan gambar dengan caption
      if (message.message.imageMessage?.caption) {
        let textMessage = message.message.imageMessage?.caption;

        try {
          spinner
            .info(
              `New hidetag image message: ${textMessage} requested into group: ${chalk.underline.bold.yellowBright(
                groupName
              )} (${groupParticipants.length} participants)\nHidetag message: ${textMessage}\n\n`
            )
            .start();

          // Kirim pesan gambar normal dengan mentions semua peserta grup
          sock.sendMessage(groupJid, {
            image: message.message.imageMessage,
            caption: textMessage,
            edit: message.key,
            mentions: groupParticipants.map((item) => item.id),
          });
        } catch (error) {
          spinner
            .fail(
              `Failed to send normal image message using hidetag. Error: ${error.toString()}`
            )
            .start();
        }
      }

      // Jika ada pesan gambar yang hanya bisa dibuka sekali
      // Jika ada pesan gambar yang hanya bisa dibuka sekali
      if (message.message.viewOnceMessage?.message?.imageMessage) {
        let imageMessage = message.message.viewOnceMessage.message.imageMessage;
        let caption = imageMessage.caption || "No caption";

        try {
          spinner
            .info(
              `New view-once hidetag image message: ${caption} requested into group: ${chalk.underline.bold.yellowBright(
                groupName
              )} (${groupParticipants.length} participants)\nHidetag message: ${caption}\n\n`
            )
            .start();

          // Kirim pesan gambar sekali buka dengan mentions semua peserta grup
          await sock.sendMessage(groupJid, {
            image: imageMessage,
            caption: caption,
            edit: message.key,
            mentions: groupParticipants.map((item) => item.id),
            viewOnce: true, // Properti ini digunakan untuk pesan sekali buka
          });
        } catch (error) {
          spinner
            .fail(
              `Failed to send view-once message using hidetag. Error: ${error.toString()}`
            )
            .start();
        }
      }


    }
  });
};

showBanner();

whatsapp();
