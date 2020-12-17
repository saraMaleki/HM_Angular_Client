import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { HttpService } from './http.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  styles: []
})
export class AppComponent implements OnInit {
  title = 'HM Client-Server';
  username = '';
  csvReady = false;
  message = [];
  inputError = false;
  dictionary = {};
  serverMessages = [];
  experimentId = "";
  zeroIterationSamples = []
  exchandedData = []
  processStart = false;


  @ViewChild('f', { static: false }) slForm: NgForm;

  constructor(
    private http: HttpService, private httpClient: HttpClient) { }

  ngOnInit() {
    this.serverMessages.push("waiting for user inputs...");
    this.processStart = false;
    this.inputError = false;
  }

  async onSubmit(form: NgForm) {
    this.processStart = true;
    const value = form.value;

    this.validation(value.x1from, value.x1to, value.x2from, value.x2to, value.numberOfIteration, value.numberOfSamples);


    if (!this.inputError) {

      this.create_Config(value.x1from, value.x1to, value.x2from, value.x2to, value.numberOfIteration, value.numberOfSamples, 0)

      try {
        let httpData = await this.http.getDataSynchronous(this.dictionary);

        console.log("data is", httpData);

        this.serverMessages.push("Server send Experiment id : " + httpData["experiment_id"]);
        this.experimentId = httpData["experiment_id"];

        this.serverMessages.push("Requested X1,X2 from server:(" + httpData["requests"].length + " points)");

        for (let i = 0; i < httpData["requests"].length; i++) {
          this.serverMessages.push("x1 : " + httpData["requests"][i].x1 + ", x2 : " + httpData["requests"][i].x2);
        }
        this.serverMessages.push("---------------------------------");
        this.serverMessages.push("Begin of producing chakong haimes output values for received data from hypermapper server...")


        for (let i = 0; i < httpData["requests"].length; i++) {
          let x_pairs = {}
          x_pairs['x1'] = httpData["requests"][i].x1
          x_pairs['x2'] = httpData["requests"][i].x2

          let chakongHaimesResult = this.chakong_haimes(x_pairs);
          // console.log("chakongHaimesResult" + chakongHaimesResult['x1'],chakongHaimesResult['x2'],
          // chakongHaimesResult['f1_value'],chakongHaimesResult['f2_value'],chakongHaimesResult['Valid']);

          this.zeroIterationSamples.push(chakongHaimesResult);
          // console.log(this.zeroIterationSamples);
          //update file of exchanged points
          this.exchandedData.push(chakongHaimesResult);
          this.serverMessages.push("x1 : " + chakongHaimesResult['x1']
            + ", x2 : " + chakongHaimesResult['x2']
            + ", f1_value : " + chakongHaimesResult['f1_value']
            + ", f2_value : " + chakongHaimesResult['f2_value']
            + ", Valid : " + chakongHaimesResult['Valid'])
        }
        this.serverMessages.push("End of producing chakong haimes.");
        this.serverMessages.push("---------------------------------");
        this.serverMessages.push("Then send samples to HM server, to warm restart and begin optimization phase");


        // new config for resume resume_optimization should create & send
        this.create_Config(value.x1from, value.x1to, value.x2from, value.x2to, value.numberOfIteration, value.numberOfSamples, 1);

        const iterationZeroRequest = {
          "results": JSON.stringify(this.zeroIterationSamples), "iteration_number": 0,
          "experiment_id": this.experimentId, "config": JSON.stringify(this.dictionary)
        }

        httpData = await this.http.getDataOfZeroExperimentSynchronous(iterationZeroRequest);
        this.serverMessages.push("Data arrived from server...");


        for (let i = 0; i < httpData["requests"].length; i++) {
          let x_pairs = {}
          x_pairs['x1'] = httpData["requests"][i].x1
          x_pairs['x2'] = httpData["requests"][i].x2
          this.serverMessages.push("itr_No" + httpData["iteration_number"] + "=>" + "x1 : " +
            x_pairs['x1'] + ", x2 : " + x_pairs['x2'])
        }

        //iterations start to reach number_Of_iteration
        for (let itrNo = 1; itrNo <= value.numberOfIteration; itrNo++) {
          let iteration_samples = [];
          let request_sample_count = httpData["requests"].length;

          for (let req_sample = 0; req_sample < request_sample_count; req_sample++) {
            let x_pairs = {}
            x_pairs['x1'] = httpData["requests"][req_sample].x1
            x_pairs['x2'] = httpData["requests"][req_sample].x2
            let chakongHaimesResult = this.chakong_haimes(x_pairs);
            this.serverMessages.push("x1 : " + chakongHaimesResult['x1']
              + ", x2 : " + chakongHaimesResult['x2']
              + ", f1_value : " + chakongHaimesResult['f1_value']
              + ", f2_value : " + chakongHaimesResult['f2_value']
              + ", Valid : " + chakongHaimesResult['Valid'])

            // add all previous data to iteration_samples
            this.exchandedData.push(chakongHaimesResult);
          }
          const iterationRequest = {
            "results": JSON.stringify(this.exchandedData), "iteration_number": itrNo,
            "experiment_id": this.experimentId, "config": JSON.stringify(this.dictionary)
          }
          httpData = await this.http.getDataOfExperimentSynchronous(iterationRequest, itrNo);

          for (let i = 0; i < httpData["requests"].length; i++) {
            if (itrNo <= value.numberOfIteration - 1) {
              let x_pairs = {}
              x_pairs['x1'] = httpData["requests"][i].x1
              x_pairs['x2'] = httpData["requests"][i].x2
              this.serverMessages.push("itr_No " + httpData["iteration_number"] + "=>" + "x1 : " +
                x_pairs['x1'] + ", x2 : " + x_pairs['x2'])
            }
          }
        } //end of iterations
        this.serverMessages.push("End of iterations.You can download csv result.")
        this.csvReady = true;
      }
      catch (e) {
        console.log("error", e);
      }
    }
    else {
      console.log("config error")
      this.inputError = true;
      this.processStart = false;
    }
  }


  public async downloadResource(): Promise<Blob> {

    const file = await this.httpClient.get<Blob>(
      this.http.SERVER_URL + '/result?experiment_id=' + this.experimentId,
      { responseType: 'blob' as 'json' }).toPromise();
    return file;
  }

  public async downloadcsv(): Promise<void> {
    try {
      const blob = await this.downloadResource();
      var a = document.createElement("a");
      document.body.appendChild(a);
      a.setAttribute("display", "none");
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = "Result_" + this.experimentId + ".csv";
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      //delete files on server
      this.httpClient.get<any>(this.http.SERVER_URL + "/delete?experiment_id=" + this.experimentId).toPromise();
      this.processStart = false;
    } catch (error) {
      console.log(error);
    }


  }

  chakong_haimes(X) {
    let x1 = X['x1']
    let x2 = X['x2']
    let f1_value = 2 + (x1 - 2) * (x1 - 2) + (x2 - 1) * (x2 - 1)
    let f2_value = 9 * x1 - (x2 - 1) * (x2 - 1)

    //  check constraints
    let c1 = x1 * x1 + x2 * x2 <= 225
    let c2 = x1 - 3 * x2 + 10 <= 0
    let valid = c1 && c2

    let output = {}
    output['x1'] = x1
    output['x2'] = x2
    output['f1_value'] = f1_value
    output['f2_value'] = f2_value
    output['Valid'] = valid
    output['Timestamp'] = 0

    return output
  }

  create_Config(x1from, x1to, x2from, x2to, number_Of_iteration, number_Of_samples, flag) {
    if (flag == 0) {
      this.dictionary = {
        "application_name": "client-server_chakong_haimes",
        "log_file": "hypermapper_logfile.log",
        "optimization_objectives": ["f1_value", "f2_value"],
        "hypermapper_mode": {
          "mode": "client-server"
        },
        "feasible_output": {
          "enable_feasible_predictor": true,
          "name": "Valid",
          "true_value": "True",
          "false_value": "False"
        },
        "design_of_experiment": {
          "doe_type": "random sampling",
          "number_of_samples": parseInt(number_Of_samples)
        },
        "optimization_iterations": parseInt(number_Of_iteration),
        "input_parameters": {
          "x1": {
            "parameter_type": "real",
            "values": [parseInt(x1from), parseInt(x1to)],
            "parameter_default": (parseInt(x1from) + parseInt(x1to)) / 2
          },
          "x2": {
            "parameter_type": "real",
            "values": [parseInt(x2from), parseInt(x2to)],
            "parameter_default": (parseInt(x2from) + parseInt(x2to)) / 2
          }
        }
      }
    }
    else {
      this.dictionary = {
        "application_name": "client-server_chakong_haimes",
        "log_file": "hypermapper_logfile.log",
        "optimization_objectives": ["f1_value", "f2_value"],
        "resume_optimization": true,
        "resume_optimization_data": "chakong_resume_samples.csv",
        "hypermapper_mode": {
          "mode": "client-server"
        },
        "feasible_output": {
          "enable_feasible_predictor": true,
          "name": "Valid",
          "true_value": "True",
          "false_value": "False"
        },
        "design_of_experiment": {
          "doe_type": "random sampling",
          "number_of_samples": parseInt(number_Of_samples)
        },
        "optimization_iterations": 1,
        "input_parameters": {
          "x1": {
            "parameter_type": "real",
            "values": [parseInt(x1from), parseInt(x1to)],
            "parameter_default": (parseInt(x1from) + parseInt(x1to)) / 2
          },
          "x2": {
            "parameter_type": "real",
            "values": [parseInt(x2from), parseInt(x2to)],
            "parameter_default": (parseInt(x2from) + parseInt(x2to)) / 2
          }
        }
      }
    }
  }


  validation(x1from, x1to, x2from, x2to, number_Of_iteration, number_Of_samples) {
    this.message = [];
    try {
      if (parseInt(number_Of_iteration) < 1) {
        this.message.push("number of iterations should be more than 1");
        this.inputError = true;
      }
      if (parseInt(number_Of_samples) < 1) {
        this.message.push("number of samples should be more than 1");
        this.inputError = true;
      }
      if (parseInt(x1to) <= parseInt(x1from)) {
        this.message.push("from-x1 should be less than to-x1 ");
        this.inputError = true;
      }
      if (parseInt(x2to) <= parseInt(x2from)) {
        this.message.push("from-x2 should be less than to-x2 ");
        this.inputError = true;
      }
    } catch (error) {
      this.message.push("Error in input values")
      this.inputError = true;
    }

  }
}
