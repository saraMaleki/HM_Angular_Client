import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams  } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class HttpService {
  // jsonFile = '../assets/products.json';

  SERVER_URL="https://hypermapper-server.herokuapp.com";
  // SERVER_URL = "http://127.0.0.1:5000";
  

  constructor(private http: HttpClient) {}

  getDataSynchronous(configDictionary) {
    const data =JSON.stringify(configDictionary);
    return  this.http.post(this.SERVER_URL+"/initialize",data ).toPromise()
   
  }

  getDataOfZeroExperimentSynchronous(iterationZeroRequest) {
    return  this.http.post(this.SERVER_URL+"/experiment/0",iterationZeroRequest ).toPromise()
   
  }
  getDataOfExperimentSynchronous(iterationRequest,itrNo) {
    return  this.http.post(this.SERVER_URL+"/experiment/"+itrNo,iterationRequest ).toPromise()
   
  }


}